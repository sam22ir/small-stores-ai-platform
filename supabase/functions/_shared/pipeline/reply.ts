import Anthropic from "@anthropic-ai/sdk";
import { fastPathReply } from "../agent/fastpath.ts";
import {
  type Lang,
  conversationLang,
  conversationSignal,
  holdingReply,
  languageCorrection,
  languageMismatch,
  limitReply,
  scriptCorrection,
  scriptProblem,
} from "../agent/language.ts";
import { stripStrayLabels } from "../agent/reply-clean.ts";
import { runAgentChatCompletions } from "../agent/chat_completions.ts";
import {
  AllProvidersFailed,
  type AttemptError,
  CircuitBreaker,
  providerFromEnv,
  runWithFallback,
} from "../agent/providers.ts";
import { DEFAULT_MODEL, runAgent } from "../agent/run.ts";
import { errorKind } from "../agent/errors.ts";
import type { AgentResult, ChatMessage, ProductPhoto } from "../agent/types.ts";
import { fetchImageDataUrl } from "../meta/media.ts";
import { MAX_IMAGES } from "../meta/webhook.ts";
import { supabaseCatalog, supabaseDeliveryFees, supabaseFaq, supabaseOrders, supabasePhotos } from "./ports.ts";
import { claimCapAlert, getUsage, loadLookups } from "./usage.ts";
import { billingState, claimBillingAlert } from "../billing.ts";
import { announceOrders } from "./alerts.ts";
import type { HandleInboundInput, HandleInboundResult, OwnerAlert } from "./types.ts";

// Everything that happens between "a customer message is stored" and "the reply is stored":
// fast path, monthly limit, history, the model call (with provider fallback), run logging
// and handoff. Shared by the dashboard test chat and the Meta webhook.

const HISTORY_LIMIT = 20;
// Per isolate: skips a primary that keeps failing so customers don't wait on a dead endpoint.
const breaker = new CircuitBreaker();

// A photo the agent sent has no body, only attachments. The model sees a note instead, so it knows
// the photo already went out (see the prompt rules).
export function photoHistoryNotes(attachments: unknown): string[] {
  if (!Array.isArray(attachments)) return [];
  return attachments.flatMap((a: { type?: unknown; caption?: unknown }) => {
    if (a?.type !== "image") return [];
    const caption = typeof a.caption === "string" && a.caption.trim() ? a.caption.trim() : "a product";
    return [`[sent a photo of ${caption}]`];
  });
}

const addUsage = (a: AgentResult["usage"], b: AgentResult["usage"]) => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
});

// Runs the model once. If the reply uses the wrong script for the conversation (Arabic letters in a
// Latin-letter Darija chat, or Cyrillic anywhere), runs it once more with a user-side note naming the
// problem, and counts both calls' tokens. The second reply is sent even if it is still wrong. No retry
// after an order was created or a photo was queued, because the first run already changed the store.
export async function replyWithScriptCheck(
  history: ChatMessage[],
  rawCall: (turns: ChatMessage[]) => Promise<AgentResult>,
): Promise<AgentResult> {
  // Stray "VOICE:"-style labels are removed from every reply before the script check and the send.
  const call = async (turns: ChatMessage[]) => {
    const r = await rawCall(turns);
    return { ...r, reply: stripStrayLabels(r.reply) };
  };
  const first = await call(history);
  const lang = conversationSignal(history);
  const problem = scriptProblem(first.reply, lang);
  // Script first; then a reply that is confidently in another language than the conversation.
  const wrongLang = !problem && lang ? languageMismatch(first.reply, lang) : null;
  // Only a successful create_order changed the store; a refused one did not.
  const wroteOrQueued = first.toolCalls.some((t) =>
    (t.name === "create_order" && !t.is_error) || t.name === "send_product_photo"
  );
  if ((!problem && !wrongLang) || wroteOrQueued) return first;
  const note = problem ? scriptCorrection(problem) : languageCorrection(lang!);
  let retry: AgentResult;
  try {
    retry = await call([
      ...history,
      { role: "assistant", text: first.reply },
      { role: "user", text: note },
    ]);
  } catch (err) {
    console.warn(JSON.stringify({ event: "reply_script_retry_failed", error_kind: errorKind(err) }));
    return first;
  }
  const usage = addUsage(first.usage, retry.usage);
  if (!retry.reply.trim()) return { ...first, usage };
  // A handoff the first run made stays: the retry may not repeat the tool call.
  return {
    ...retry,
    usage,
    toolCalls: [...first.toolCalls, ...retry.toolCalls],
    handoffReason: retry.handoffReason ?? first.handoffReason,
    handoffSummary: retry.handoffSummary ?? first.handoffSummary,
  };
}

// The language of the conversation (stored history plus the current message), read from the database.
// Used on paths that return before the history is loaded, and for fast-path replies after a match.
// Null when neither the messages nor the current text give a signal.
async function cannedSignal(db: HandleInboundInput["db"], conversationId: string, text: string): Promise<Lang | null> {
  const { data } = await db.from("messages")
    .select("direction,body")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  const stored = (data ?? []).slice().reverse().flatMap((m): { role: string; text: string }[] =>
    m.body ? [{ role: m.direction === "inbound" ? "user" : "assistant", text: m.body as string }] : []
  );
  return conversationSignal([...stored, { role: "user", text }]);
}

// For the server's fixed replies: the conversation language, English only when there is no signal.
const cannedLang = async (db: HandleInboundInput["db"], conversationId: string, text: string): Promise<Lang> =>
  (await cannedSignal(db, conversationId, text)) ?? "en";

export async function processLocked(input: HandleInboundInput, alerts: OwnerAlert[]): Promise<HandleInboundResult> {
  const { db, store, conversation, source } = input;
  const base = {
    handoff: null,
    tool_calls: [] as string[],
    usage: { input_tokens: 0, output_tokens: 0 },
    model: null,
    provider: null,
    fell_back: false,
    fast_path: false,
    limited: false,
  };

  // Once handed to the owner the bot stays silent.
  if (conversation.status !== "bot") {
    return {
      ok: true,
      ...base,
      reply: null,
      status: conversation.status,
      note: "Conversation is with the owner.",
    };
  }
  // The owner switched the assistant off: customer messages wait for them. Test chats still work.
  if (source === "customer" && !store.agent_enabled) {
    return { ok: true, ...base, reply: null, status: "bot", note: "Assistant is turned off." };
  }

  const record = async (
    result: { reply: string; model: string; provider: string | null; photos?: ProductPhoto[] },
    extra: Record<string, unknown>,
  ) => {
    // Customer replies are sent to the channel by deliverPending (_shared/meta/deliver.ts).
    const deliveryStatus = source === "customer" ? "pending" : "sent";
    const { error: msgErr } = await db.from("messages").insert({
      store_id: store.id,
      conversation_id: conversation.id,
      channel_id: input.channelId,
      direction: "outbound",
      sender: "agent",
      body: result.reply,
      delivery_status: deliveryStatus,
    });
    if (msgErr) throw msgErr;
    // One row per photo, right after the text, so the text is delivered first. Inserted one at a time:
    // a single multi-row insert would give the rows the same created_at, and their order would be lost.
    for (const p of result.photos ?? []) {
      const { error: photoErr } = await db.from("messages").insert({
        store_id: store.id,
        conversation_id: conversation.id,
        channel_id: input.channelId,
        direction: "outbound",
        sender: "agent",
        body: null,
        attachments: [{ type: "image", url: p.url, caption: p.name }],
        delivery_status: deliveryStatus,
      });
      if (photoErr) throw photoErr;
    }
    const { error: runErr } = await db.from("agent_runs").insert({
      store_id: store.id,
      conversation_id: conversation.id,
      trigger_message_id: input.inboundMessageId,
      model: result.model,
      provider: result.provider,
      source,
      ...extra,
    });
    if (runErr) throw runErr;
  };

  // 1. Zero-cost replies. The conversation's language is read only when a greeting or thanks matched.
  const fast = fastPathReply(input.text, store.name)
    ? fastPathReply(input.text, store.name, await cannedSignal(db, conversation.id, input.text))
    : null;
  if (fast) {
    await record({ reply: fast, model: "fast-path", provider: "fast-path" }, {
      fast_path: true,
    });
    return {
      ok: true,
      ...base,
      reply: fast,
      status: "bot",
      model: "fast-path",
      provider: "fast-path",
      fast_path: true,
    };
  }

  // 2. Subscription: after the trial and the paid period (plus grace), customers are handed to the
  // owner without a model call. Same handling as the caps; the owner is alerted once per lapse.
  // Off until BILLING_ENFORCED=true, so stores are never cut off before payments can be taken.
  if (source === "customer" && input.env("BILLING_ENFORCED") === "true") {
    const billing = billingState(store, input.now ?? new Date());
    if (billing.blocked && billing.lapsedAt) {
      const reason = "Subscription expired";
      const reply = holdingReply(await cannedLang(db, conversation.id, input.text));
      await record({ reply, model: "billing", provider: "none" }, { fast_path: true, error: null });
      await db.from("conversations")
        .update({ status: "human", handoff_reason: reason, handoff_summary: null })
        .eq("id", conversation.id);
      if (await claimBillingAlert(db, store.id, billing.lapsedAt, store.billing_alerted_for)) {
        alerts.push({ kind: "billing" });
      }
      return { ok: true, ...base, reply, status: "human", handoff: reason, limited: true };
    }
  }

  // Hands the chat to the owner because the monthly reply allowance is spent.
  const limitHandoff = async (): Promise<HandleInboundResult> => {
    const reason = "Monthly AI reply limit reached";
    const reply = limitReply(await cannedLang(db, conversation.id, input.text));
    await record({ reply, model: "limit", provider: "none" }, {
      fast_path: true,
      error: null,
    });
    await db.from("conversations")
      .update({ status: "human", handoff_reason: reason, handoff_summary: null })
      .eq("id", conversation.id);
    alerts.push({ kind: "limit" });
    return {
      ok: true,
      ...base,
      reply,
      status: "human",
      handoff: reason,
      limited: true,
    };
  };

  // 3. Monthly allowance (customer traffic only).
  let needsCredit = false;
  if (source === "customer") {
    const usage = await getUsage(
      db,
      store.id,
      store.monthly_reply_limit,
      input.now,
      store.ai_monthly_token_limit ?? null,
    );
    if (usage.exceeded) {
      // Bought credits cover this reply. The credit is spent just before the model call (step 4),
      // so the token cap below still applies to it.
      if ((store.reply_credits ?? 0) > 0) needsCredit = true;
      else return limitHandoff();
    }

    // Monthly token cap (input + output tokens). Same handling as the reply limit, but the owner is
    // alerted once per month, and only when a Telegram alert can be sent.
    if (usage.tokens.exceeded) {
      const reason = "Monthly AI token cap reached";
      const reply = limitReply(await cannedLang(db, conversation.id, input.text));
      await record({ reply, model: "token-cap", provider: "none" }, { fast_path: true, error: null });
      await db.from("conversations")
        .update({ status: "human", handoff_reason: reason, handoff_summary: null })
        .eq("id", conversation.id);
      console.warn(JSON.stringify({
        event: "ai_token_cap_reached",
        store_id: store.id,
        conversation_id: conversation.id,
        tokens_used: usage.tokens.used,
        token_limit: usage.tokens.limit,
      }));
      if (await claimCapAlert(db, store.id, input.now)) alerts.push({ kind: "token_cap" });
      return { ok: true, ...base, reply, status: "human", handoff: reason, limited: true };
    }
  }

  // 4. The model.
  const env = input.env;
  const useOpenAICompatible = env("LLM_PROVIDER") === "openai-compatible";
  const primary = providerFromEnv(env, "LLM_");
  const fallback = providerFromEnv(env, "LLM_FALLBACK_");
  const anthropicKey = env("ANTHROPIC_API_KEY");
  if (useOpenAICompatible) {
    if (!primary) return { ok: false, error: "LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set" };
  } else if (!anthropicKey) {
    return { ok: false, error: "ANTHROPIC_API_KEY is not set" };
  }

  const { data: rows, error: histErr } = await db
    .from("messages")
    .select("direction,body,attachments")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (histErr) throw histErr;
  const ordered = (rows ?? []).slice().reverse();
  const history: ChatMessage[] = ordered.flatMap((m): ChatMessage[] => {
    if (m.body) {
      return [{ role: m.direction === "inbound" ? "user" : "assistant", text: m.body as string }];
    }
    // Outbound photo rows have no body: keep a note so the model knows the photo was sent.
    if (m.direction === "outbound") {
      return photoHistoryNotes(m.attachments).map((text): ChatMessage => ({ role: "assistant", text }));
    }
    return [];
  });

  // Photos sent since our last reply (newest MAX_IMAGES, see meta/webhook.ts). Fetched only when a model that sees images
  // may answer; the photos go on the last customer turn, and text-only providers never receive them.
  const useVision = useOpenAICompatible ? !!primary?.vision || !!fallback?.vision : true;
  if (useVision) {
    const urls: string[] = [];
    for (let i = ordered.length - 1; i >= 0 && ordered[i].direction === "inbound"; i--) {
      const atts = (ordered[i].attachments ?? []) as { type?: string; url?: string }[];
      for (const a of atts) {
        if (a.type === "image" && a.url && urls.length < MAX_IMAGES) urls.push(a.url);
      }
    }
    if (urls.length) {
      const fetched = await Promise.all(urls.reverse().map((u) => fetchImageDataUrl(u)));
      const images = fetched.flatMap((r) => {
        if (r.ok) return [{ dataUrl: r.dataUrl }];
        console.warn("media: image skipped", r.reason);
        return [];
      });
      const lastCustomer = history.map((m) => m.role).lastIndexOf("user");
      if (images.length && lastCustomer >= 0) history[lastCustomer] = { ...history[lastCustomer], images };
    }
  }
  // The same turns without photos, for providers that can't see them.
  const textOnly = (turns: ChatMessage[]) => turns.map((m) => ({ role: m.role, text: m.text }));

  const lookups = await loadLookups(db, conversation.id);

  const model = useOpenAICompatible ? primary!.model : env("AGENT_MODEL") ?? DEFAULT_MODEL;
  const meta: { provider: string | null; attempts: AttemptError[] } = {
    provider: null,
    attempts: [],
  };

  // Spend the bought credit right before the model call. If it can't be spent (error or none left),
  // the chat takes the normal limit hand-off: no free reply.
  let creditSpent = false;
  if (needsCredit) {
    let spent = false;
    try {
      const { data, error } = await db.rpc("consume_reply_credit", { p_store_id: store.id });
      if (error) throw error;
      spent = data === true;
    } catch (err) {
      console.error(JSON.stringify({ event: "reply_credit_consume_failed", store_id: store.id, error_kind: errorKind(err) }));
    }
    if (!spent) return limitHandoff();
    creditSpent = true;
  }
  // True once a successful run row is stored. A credit spent without one is refunded below.
  let runRecorded = false;

  try {
    const catalog = supabaseCatalog(db);
    // Test and dev chats price and validate orders but never write them.
    const ordersPort = store.orders_enabled ? supabaseOrders(db, source !== "customer") : undefined;
    const orders = ordersPort && source === "customer" ? announceOrders(ordersPort, alerts) : ordersPort;
    const common = {
      catalog,
      store,
      lookups,
      orders,
      faq: supabaseFaq(db),
      fees: supabaseDeliveryFees(db),
      conversationId: conversation.id,
      customerId: input.customerId,
      storageBase: env("SUPABASE_URL"),
      photos: supabasePhotos(db),
    };

    // One model call (with provider fallback) on the given turns.
    const callModel = async (turns: ChatMessage[]): Promise<AgentResult> => {
      if (useOpenAICompatible) {
        const r = await runWithFallback({
          providers: fallback ? [primary!, fallback] : [primary!],
          breaker,
          run: (p, limits) =>
            runAgentChatCompletions({
              ...common,
              history: p.vision ? turns : textOnly(turns),
              baseUrl: p.baseUrl,
              apiKey: p.apiKey,
              model: p.model,
              tokenParam: p.tokenParam,
              reasoningEffort: p.reasoningEffort,
              temperature: p.temperature,
              timeoutMs: limits.timeoutMs,
              maxAttempts: limits.maxAttempts,
            }),
        });
        meta.provider = r.provider.name;
        meta.attempts.push(...r.attempts);
        return r.result;
      }
      meta.provider = "anthropic";
      return runAgent({
        ...common,
        history: turns,
        client: new Anthropic({ apiKey: anthropicKey }),
        model,
      });
    };
    const result = await replyWithScriptCheck(history, callModel);

    await record({ reply: result.reply, model: result.model, provider: meta.provider, photos: result.photos }, {
      tool_calls: result.toolCalls,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      provider_errors: meta.attempts.length ? meta.attempts : null,
      used_credit: creditSpent,
    });
    runRecorded = true;
    let status = "bot";
    if (result.handoffReason) {
      status = "human";
      await db.from("conversations")
        .update({ status: "human", handoff_reason: result.handoffReason, handoff_summary: result.handoffSummary })
        .eq("id", conversation.id);
      if (source === "customer") {
        alerts.push({ kind: "handoff", reason: result.handoffReason, summary: result.handoffSummary });
      }
    }
    return {
      ok: true,
      reply: result.reply,
      status,
      handoff: result.handoffReason,
      tool_calls: result.toolCalls.map((t) => t.name),
      usage: result.usage,
      model: result.model,
      provider: meta.provider,
      fell_back: meta.attempts.length > 0,
      fast_path: false,
      limited: false,
      ...(result.photos ? { photos: result.photos } : {}),
    };
  } catch (err) {
    const { data: failedRun } = await db.from("agent_runs")
      .insert({
        store_id: store.id,
        conversation_id: conversation.id,
        trigger_message_id: input.inboundMessageId,
        model,
        source,
        error: err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err),
        provider_errors: err instanceof AllProvidersFailed ? err.attempts : null,
      })
      .select("id")
      .maybeSingle();
    // Structured, no message text: provider errors can echo request details.
    console.error(JSON.stringify({
      event: "agent_run_failed",
      store_id: store.id,
      run_id: (failedRun as { id?: string } | null)?.id ?? null,
      conversation_id: conversation.id,
      error_kind: errorKind(err),
    }));
    // A real customer must never be left hanging: say the owner will reply and put the chat in
    // the owner's "Needs you" list. Test chats show the failure instead, so outages are visible.
    if (source === "customer") {
      const reply = holdingReply(conversationLang([...history, { role: "user", text: input.text }]));
      const reason = "The assistant couldn't answer (AI service unavailable). Please reply yourself.";
      await db.from("messages").insert({
        store_id: store.id,
        conversation_id: conversation.id,
        channel_id: input.channelId,
        direction: "outbound",
        sender: "agent",
        body: reply,
        delivery_status: "pending",
      });
      await db.from("conversations")
        .update({ status: "human", handoff_reason: reason, handoff_summary: null })
        .eq("id", conversation.id);
      alerts.push({ kind: "degraded" });
      return {
        ok: true,
        ...base,
        reply,
        status: "human",
        handoff: reason,
        degraded: true,
      };
    }
    return { ok: false, error: "Agent failed; see agent_runs for details" };
  } finally {
    // The credit paid for a reply that never reached the customer: give it back.
    if (creditSpent && !runRecorded) {
      const failed = (err: unknown) =>
        console.error(JSON.stringify({ event: "reply_credit_refund_failed", store_id: store.id, error_kind: errorKind(err) }));
      try {
        const { error } = await db.rpc("add_reply_credits", { p_store_id: store.id, p_n: 1 });
        if (error) failed(error);
      } catch (err) {
        failed(err);
      }
    }
  }
}
