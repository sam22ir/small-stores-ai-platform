import Anthropic from "@anthropic-ai/sdk";
import { fastPathReply } from "../agent/fastpath.ts";
import { detectLang, holdingReply, limitReply } from "../agent/language.ts";
import { runAgentChatCompletions } from "../agent/chat_completions.ts";
import {
  AllProvidersFailed,
  type AttemptError,
  CircuitBreaker,
  providerFromEnv,
  runWithFallback,
} from "../agent/providers.ts";
import { DEFAULT_MODEL, runAgent } from "../agent/run.ts";
import type { AgentResult, ChatMessage } from "../agent/types.ts";
import { supabaseCatalog, supabaseFaq, supabaseOrders } from "./ports.ts";
import { getUsage, loadLookups } from "./usage.ts";
import { announceOrders } from "./alerts.ts";
import type { HandleInboundInput, HandleInboundResult, OwnerAlert } from "./types.ts";

// Everything that happens between "a customer message is stored" and "the reply is stored":
// fast path, monthly limit, history, the model call (with provider fallback), run logging
// and handoff. Shared by the dashboard test chat and the Meta webhook.

const HISTORY_LIMIT = 20;
// Per isolate: skips a primary that keeps failing so customers don't wait on a dead endpoint.
const breaker = new CircuitBreaker();

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
    result: { reply: string; model: string; provider: string | null },
    extra: Record<string, unknown>,
  ) => {
    const { error: msgErr } = await db.from("messages").insert({
      store_id: store.id,
      conversation_id: conversation.id,
      channel_id: input.channelId,
      direction: "outbound",
      sender: "agent",
      body: result.reply,
      // Customer replies are sent to the channel by deliverPending (_shared/meta/deliver.ts).
      delivery_status: source === "customer" ? "pending" : "sent",
    });
    if (msgErr) throw msgErr;
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

  // 1. Zero-cost replies.
  const fast = fastPathReply(input.text, store.name);
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

  // 2. Monthly allowance (customer traffic only).
  if (source === "customer") {
    const usage = await getUsage(db, store.id, store.monthly_reply_limit, input.now);
    if (usage.exceeded) {
      const reason = "Monthly AI reply limit reached";
      const reply = limitReply(detectLang(input.text));
      await record({ reply, model: "limit", provider: "none" }, {
        fast_path: true,
        error: null,
      });
      await db.from("conversations")
        .update({ status: "human", handoff_reason: reason })
        .eq("id", conversation.id);
      if (source === "customer") alerts.push({ kind: "limit" });
      return {
        ok: true,
        ...base,
        reply,
        status: "human",
        handoff: reason,
        limited: true,
      };
    }
  }

  // 3. The model.
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
    .select("direction,body")
    .eq("conversation_id", conversation.id)
    .order("created_at", { ascending: false })
    .limit(HISTORY_LIMIT);
  if (histErr) throw histErr;
  const history: ChatMessage[] = (rows ?? []).reverse()
    .filter((m) => m.body)
    .map((m) => ({
      role: m.direction === "inbound" ? "user" : "assistant",
      text: m.body as string,
    }));

  const lookups = await loadLookups(db, conversation.id);

  const model = useOpenAICompatible ? primary!.model : env("AGENT_MODEL") ?? DEFAULT_MODEL;
  const meta: { provider: string | null; attempts: AttemptError[] } = {
    provider: null,
    attempts: [],
  };

  try {
    const catalog = supabaseCatalog(db);
    // Test and dev chats price and validate orders but never write them.
    const ordersPort = store.orders_enabled ? supabaseOrders(db, source !== "customer") : undefined;
    const orders = ordersPort && source === "customer" ? announceOrders(ordersPort, alerts) : ordersPort;
    const common = {
      catalog,
      store,
      history,
      lookups,
      orders,
      faq: supabaseFaq(db),
      conversationId: conversation.id,
      customerId: input.customerId,
    };

    let result: AgentResult;
    if (useOpenAICompatible) {
      const r = await runWithFallback({
        providers: fallback ? [primary!, fallback] : [primary!],
        breaker,
        run: (p, limits) =>
          runAgentChatCompletions({
            ...common,
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
      meta.attempts = r.attempts;
      result = r.result;
    } else {
      result = await runAgent({
        ...common,
        client: new Anthropic({ apiKey: anthropicKey }),
        model,
      });
      meta.provider = "anthropic";
    }

    await record({ reply: result.reply, model: result.model, provider: meta.provider }, {
      tool_calls: result.toolCalls,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
      provider_errors: meta.attempts.length ? meta.attempts : null,
    });
    let status = "bot";
    if (result.handoffReason) {
      status = "human";
      await db.from("conversations")
        .update({ status: "human", handoff_reason: result.handoffReason })
        .eq("id", conversation.id);
      if (source === "customer") alerts.push({ kind: "handoff", reason: result.handoffReason });
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
    };
  } catch (err) {
    console.error("agent run failed", err);
    await db.from("agent_runs").insert({
      store_id: store.id,
      conversation_id: conversation.id,
      trigger_message_id: input.inboundMessageId,
      model,
      source,
      error: err instanceof Anthropic.APIError ? `${err.status}: ${err.message}` : String(err),
      provider_errors: err instanceof AllProvidersFailed ? err.attempts : null,
    });
    // A real customer must never be left hanging: say the owner will reply and put the chat in
    // the owner's "Needs you" list. Test chats show the failure instead, so outages are visible.
    if (source === "customer") {
      const reply = holdingReply(detectLang(input.text));
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
        .update({ status: "human", handoff_reason: reason })
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
  }
}
