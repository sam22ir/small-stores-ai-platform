import type { SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import { fastPathReply } from "./agent/fastpath.ts";
import { detectLang, limitReply } from "./agent/language.ts";
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
import type {
  AgentResult,
  Catalog,
  ChatMessage,
  DeliveryQuote,
  OrderPort,
  PlaceOrderInput,
  PlaceOrderResult,
  ProductRecord,
  StoreContext,
} from "./agent/types.ts";
import { monthStartUtc, usageStatus, type UsageStatus } from "./agent/usage.ts";

// Everything that happens between "a customer message is stored" and "the reply is stored":
// fast path, monthly limit, history, the model call (with provider fallback), run logging
// and handoff. Shared by the dashboard test chat today and the Meta webhook later.

const HISTORY_LIMIT = 20;
// Per isolate: skips a primary that keeps failing so customers don't wait on a dead endpoint.
const breaker = new CircuitBreaker();

export type RunSource = "customer" | "test" | "dev";


// --- Catalog -----------------------------------------------------------------

const PRODUCT_SELECT =
  "id,name,description,price_cents,product_variants(id,label,price_cents,stock_quantity)";

// deno-lint-ignore no-explicit-any
function toProduct(row: any): ProductRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    price_cents: row.price_cents,
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
          groups.flat().flatMap((v) => [`name.ilike.*${v}*`, `description.ilike.*${v}*`])
            .join(","),
        );
      }
      const { data, error } = await q.order("name").limit(50);
      if (error) throw error;

      return (data ?? []).map(toProduct)
        .sort((a, b) =>
          scoreProduct(b.name, b.description, groups) -
          scoreProduct(a.name, a.description, groups)
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
      const hit = data.find((r) => key(r.wilaya) === key(wilaya));
      if (!hit) {
        return { served: false, fee_cents: null, options: data.map((r) => r.wilaya) };
      }
      return { served: true, fee_cents: hit.fee_cents, canonical: hit.wilaya };
    },

    async placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult> {
      const { data, error } = await client.rpc("place_order", {
        p_store_id: input.storeId,
        p_conversation_id: input.conversationId,
        p_customer_id: input.customerId,
        p_customer_name: input.customerName,
        p_phone: input.phone,
        p_wilaya: input.wilaya,
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
}

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
  }
  | { ok: false; error: string };

export async function handleInbound(input: HandleInboundInput): Promise<HandleInboundResult> {
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
      // Customer replies are delivered to Meta by a sender that is not built yet.
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
    const orders = store.orders_enabled ? supabaseOrders(db, source !== "customer") : undefined;
    const common = {
      catalog,
      store,
      history,
      orders,
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
    return { ok: false, error: "Agent failed; see agent_runs for details" };
  }
}
