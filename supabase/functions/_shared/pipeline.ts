import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { fastPathReply } from "./agent/fastpath.ts";
import { detectLang, holdingReply, limitReply } from "./agent/language.ts";
import { runAgentChatCompletions } from "./agent/chat_completions.ts";
import {
  AllProvidersFailed,
  type AttemptError,
  CircuitBreaker,
  providerFromEnv,
  runWithFallback,
} from "./agent/providers.ts";
import { DEFAULT_MODEL, runAgent } from "./agent/run.ts";
import { scoreProduct, searchGroups } from "./agent/search.ts";
import { matchWilaya } from "./agent/wilaya.ts";
import type {
  AgentResult,
  Catalog,
  ChatMessage,
  DeliveryQuote,
  FaqPort,
  OrderPort,
  PlaceOrderInput,
  PlaceOrderResult,
  ProductRecord,
  StoreContext,
} from "./agent/types.ts";
import { monthStartUtc, usageStatus, type UsageStatus } from "./agent/usage.ts";
import { notifyOwner } from "./telegram.ts";

// Everything that happens between "a customer message is stored" and "the reply is stored":
// fast path, monthly limit, history, the model call (with provider fallback), run logging
// and handoff. Shared by the dashboard test chat and the Meta webhook.

const HISTORY_LIMIT = 20;
// Per isolate: skips a primary that keeps failing so customers don't wait on a dead endpoint.
const breaker = new CircuitBreaker();

export type RunSource = "customer" | "test" | "dev";


// --- Catalog -----------------------------------------------------------------

const PRODUCT_SELECT =
  "id,name,description,price_cents,aliases,sold_out_until,product_variants(id,label,price_cents,stock_quantity)";

// deno-lint-ignore no-explicit-any
function toProduct(row: any): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price_cents: row.price_cents,
    aliases: row.aliases ?? null,
    sold_out_until: row.sold_out_until ?? null,
    variants: row.product_variants ?? [],
  };
}

export function supabaseCatalog(client: SupabaseClient): Catalog {
  return {
    async searchProducts(storeId, query, limit) {
      // Variants are letters/digits only, so they're safe inside the filter string.
      const groups = searchGroups(query);

      let q = client
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("store_id", storeId)
        .eq("active", true);
      if (groups.length) {
        q = q.or(
          groups.flat().flatMap((v) => [
            `name.ilike.*${v}*`,
            `description.ilike.*${v}*`,
            `aliases.ilike.*${v}*`,
          ])
            .join(","),
        );
      }
      const { data, error } = await q.order("name").limit(50);
      if (error) throw error;

      return (data ?? []).map(toProduct)
        .sort((a, b) =>
          scoreProduct(b.name, b.description, groups, b.aliases) -
          scoreProduct(a.name, a.description, groups, a.aliases)
        )
        .slice(0, limit);
    },

    async getProduct(storeId, productId) {
      const { data, error } = await client
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("id", productId)
        .eq("store_id", storeId)
        .eq("active", true)
        .maybeSingle();
      if (error) throw error;
      return data ? toProduct(data) : null;
    },
  };
}

// --- FAQ ---------------------------------------------------------------------

// The owner's saved answers, newest first (the tool trims them to a size budget).
export function supabaseFaq(client: SupabaseClient): FaqPort {
  return {
    async list(storeId) {
      const { data, error } = await client
        .from("faq_entries")
        .select("question,answer")
        .eq("store_id", storeId)
        .order("created_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data ?? [];
    },
  };
}

// --- Orders ------------------------------------------------------------------

const key = (wilaya: string) => wilaya.trim().toLowerCase();

// dryRun: validates and prices an order but writes nothing (dashboard test chats).
export function supabaseOrders(client: SupabaseClient, dryRun: boolean): OrderPort {
  return {
    async quoteDelivery(storeId, wilaya): Promise<DeliveryQuote> {
      const { data, error } = await client
        .from("delivery_fees")
        .select("wilaya,fee_cents")
        .eq("store_id", storeId)
        .order("wilaya");
      if (error) throw error;
      if (!data || data.length === 0) return { served: true, fee_cents: null };
      const names = data.map((r) => r.wilaya);
      const exact = data.find((r) => key(r.wilaya) === key(wilaya));
      const hit = exact ?? data.find((r) => r.wilaya === matchWilaya(wilaya, names));
      if (!hit) {
        return { served: false, fee_cents: null, options: names };
      }
      return { served: true, fee_cents: hit.fee_cents, canonical: hit.wilaya };
    },

    async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
      // Send the store's own spelling of the wilaya so the RPC's fee lookup matches.
      const { data: fees } = await client
        .from("delivery_fees")
        .select("wilaya")
        .eq("store_id", input.storeId);
      const wilaya = matchWilaya(input.wilaya, (fees ?? []).map((r) => r.wilaya)) ?? input.wilaya;
      const { data, error } = await client.rpc("place_order", {
        p_store_id: input.storeId,
        p_conversation_id: input.conversationId,
        p_customer_id: input.customerId,
        p_customer_name: input.customerName,
        p_phone: input.phone,
        p_wilaya: wilaya,
        p_address: input.address,
        p_items: input.items,
        p_key: input.key,
        p_dry_run: dryRun,
      });
      if (error) {
        const msg = error.message ?? "";
        if (msg.includes("wilaya_not_served")) return { ok: false, code: "wilaya_not_served" };
        if (msg.includes("unknown_variant")) return { ok: false, code: "unknown_variant" };
        const stock = msg.match(/insufficient_stock:(.*)/);
        if (stock) return { ok: false, code: "insufficient_stock", detail: stock[1].trim() };
        if (error.code === "P0001" || error.code === "23514" || error.code === "22P02") {
          return { ok: false, code: "invalid", detail: msg.slice(0, 200) };
        }
        throw error;
      }
      return {
        ok: true,
        order_id: data.order_id ?? "test-order",
        subtotal_cents: data.subtotal_cents,
        delivery_fee_cents: data.delivery_fee_cents,
        total_cents: data.total_cents,
        duplicate: !!data.duplicate,
      };
    },
  };
}

// --- Usage -------------------------------------------------------------------

// Billable replies this calendar month: customer-facing, answered by the model, not failed.
export async function getUsage(
  db: SupabaseClient,
  storeId: string,
  limit: number,
  now = new Date(),
): Promise<UsageStatus> {
  const { count, error } = await db
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("source", "customer")
    .eq("fast_path", false)
    .is("error", null)
    .gte("created_at", monthStartUtc(now).toISOString());
  if (error) throw error;
  return usageStatus(count ?? 0, limit);
}

// --- Main entry --------------------------------------------------------------

export interface StoreSettings extends StoreContext {
  agent_enabled: boolean;
  monthly_reply_limit: number;
}

export interface HandleInboundInput {
  db: SupabaseClient;
  env: (key: string) => string | undefined;
  store: StoreSettings;
  channelId: string;
  conversation: { id: string; status: string };
  customerId: string;
  inboundMessageId: string;
  text: string;
  source: RunSource;
  now?: Date;
  // Customers often send several short messages in a row. With debounceMs > 0 the run waits
  // that long and answers only the newest message, once. Dashboard test chats use 0.
  debounceMs?: number;
  lockWaitMs?: number; // how long to wait for another reply in the same chat to finish
  sleep?: (ms: number) => Promise<void>; // injectable for tests
  // Sends an owner alert (default: Telegram via notifyOwner). Injectable for tests.
  notify?: (storeId: string, text: string) => Promise<unknown>;
}

// Things the owner should hear about, collected during a run and sent after the reply is stored.
export type OwnerAlert =
  | { kind: "handoff"; reason: string }
  | { kind: "limit" }
  | { kind: "degraded" }
  | { kind: "order"; total_cents: number };

export type HandleInboundResult =
  | {
    ok: true;
    reply: string | null;
    status: string;
    handoff: string | null;
    note?: string;
    tool_calls: string[];
    usage: { input_tokens: number; output_tokens: number };
    model: string | null;
    provider: string | null;
    fell_back: boolean;
    fast_path: boolean;
    limited: boolean;
    degraded?: boolean; // the model was unavailable; the customer got a holding reply
  }
  | { ok: false; error: string };

async function processLocked(input: HandleInboundInput, alerts: OwnerAlert[]): Promise<HandleInboundResult> {
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

// --- Owner alerts -----------------------------------------------------------
// Each alert is a short Arabic + French line (the store has no language setting yet).

// Records each placed order (not duplicates) so the owner hears about it once.
function announceOrders(port: OrderPort, alerts: OwnerAlert[]): OrderPort {
  return {
    quoteDelivery: (storeId, wilaya) => port.quoteDelivery(storeId, wilaya),
    async placeOrder(orderInput) {
      const result = await port.placeOrder(orderInput);
      if (result.ok && !result.duplicate) {
        alerts.push({ kind: "order", total_cents: result.total_cents });
      }
      return result;
    },
  };
}

function alertText(
  alert: OwnerAlert,
  storeName: string,
  currency: string,
  who: string,
  link: string | null,
): string {
  let line: string;
  switch (alert.kind) {
    case "handoff":
      line = `${who} : besoin de votre réponse / تحتاج ردّكم` +
        (alert.reason ? ` (${alert.reason.slice(0, 120)})` : "");
      break;
    case "limit":
      line = `${who} : limite mensuelle atteinte, à vous / تم بلوغ الحد الشهري، الرد لكم`;
      break;
    case "degraded":
      line = `${who} : assistant indisponible, à vous de répondre / المساعد غير متاح، ردّكم مطلوب`;
      break;
    case "order":
      line = `Nouvelle commande de ${who} : ${Math.round(alert.total_cents / 100)} ${currency} / طلب جديد من ${who}`;
      break;
  }
  return `[${storeName}] ${line}` + (link ? `\n${link}` : "");
}

// Fire and forget: the reply is already stored and must not wait for an owner alert. The promise is
// handed to EdgeRuntime.waitUntil when available so the isolate isn't shut down mid-send.
function sendOwnerAlerts(input: HandleInboundInput, alerts: OwnerAlert[]): void {
  const work = sendOwnerAlertsNow(input, alerts);
  (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime?.waitUntil(work);
}

async function sendOwnerAlertsNow(input: HandleInboundInput, alerts: OwnerAlert[]): Promise<void> {
  if (!alerts.length) return;
  return (async () => {
    try {
      const { data } = await input.db
        .from("customers")
        .select("display_name")
        .eq("id", input.customerId)
        .maybeSingle();
      const who = (data?.display_name as string | undefined) || "Un client / عميل";
      const base = input.env("DASHBOARD_URL")?.replace(/\/+$/, "");
      const link = base ? `${base}/inbox/${input.conversation.id}` : null;
      const notify = input.notify ??
        ((storeId: string, text: string) => notifyOwner(input.db, input.env, storeId, text));
      for (const alert of alerts) {
        await notify(
          input.store.id,
          alertText(alert, input.store.name, input.store.currency, who, link),
        );
      }
    } catch (err) {
      console.error("owner alert failed", err instanceof Error ? err.message : "unknown");
    }
  })();
}

// --- Reliability wrapper -----------------------------------------------------

const EMPTY_RESULT = {
  handoff: null,
  tool_calls: [] as string[],
  usage: { input_tokens: 0, output_tokens: 0 },
  model: null,
  provider: null,
  fell_back: false,
  fast_path: false,
  limited: false,
};

async function hasNewerInbound(input: HandleInboundInput): Promise<boolean> {
  const { data, error } = await input.db
    .from("messages")
    .select("id")
    .eq("conversation_id", input.conversation.id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return !!data?.length && data[0].id !== input.inboundMessageId;
}

async function alreadyAnswered(input: HandleInboundInput): Promise<boolean> {
  const { data, error } = await input.db
    .from("agent_runs")
    .select("id")
    .eq("trigger_message_id", input.inboundMessageId)
    .limit(1);
  if (error) throw error;
  return !!data?.length;
}

// What runs for every customer message. It makes sure that, however many webhooks, retries or
// rapid-fire messages arrive, a chat gets one reply at a time and every message is answered:
//   1. wait briefly and let only the newest of a burst of messages through (debounce),
//   2. skip a message that already has a reply (webhook redelivery),
//   3. take a per-conversation lock so two replies can't be written at once,
//   4. re-check once the lock is held, because the world may have moved on while waiting.
export async function handleInbound(input: HandleInboundInput): Promise<HandleInboundResult> {
  const { db, store, conversation, source } = input;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const silent = (note: string, status = "bot"): HandleInboundResult => ({
    ok: true,
    ...EMPTY_RESULT,
    reply: null,
    status,
    note,
  });

  if (conversation.status !== "bot") {
    return silent("Conversation is with the owner.", conversation.status);
  }
  if (source === "customer" && !store.agent_enabled) return silent("Assistant is turned off.");

  if ((input.debounceMs ?? 0) > 0) {
    await sleep(input.debounceMs!);
    if (await hasNewerInbound(input)) return silent("A newer message will be answered instead.");
  }
  if (await alreadyAnswered(input)) return silent("This message was already answered.");

  const alerts: OwnerAlert[] = [];
  const polls = Math.max(1, Math.ceil((input.lockWaitMs ?? 30_000) / 1000));
  let claimed = false;
  for (let i = 0; i < polls && !claimed; i++) {
    const { data, error } = await db.rpc("claim_conversation", {
      p_conversation_id: conversation.id,
      p_seconds: 90,
    });
    if (error) throw error;
    claimed = data === true;
    if (!claimed) await sleep(1000);
  }
  if (!claimed) return silent("Another reply is still in progress.");

  try {
    // The owner may have taken over, or more messages may have arrived, while we waited.
    const { data: fresh, error: freshErr } = await db
      .from("conversations")
      .select("status")
      .eq("id", conversation.id)
      .maybeSingle();
    if (freshErr) throw freshErr;
    if (fresh && fresh.status !== "bot") return silent("Conversation is with the owner.", fresh.status);
    if (await hasNewerInbound(input)) return silent("A newer message will be answered instead.");
    if (await alreadyAnswered(input)) return silent("This message was already answered.");
    const result = await processLocked(input, alerts);
    sendOwnerAlerts(input, alerts);
    return result;
  } finally {
    const { error } = await db.rpc("release_conversation", { p_conversation_id: conversation.id });
    if (error) console.error("release_conversation failed", error);
  }
}
