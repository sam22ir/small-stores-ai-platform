import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";
import Anthropic from "@anthropic-ai/sdk";
import { DEFAULT_MODEL, runAgent } from "../_shared/agent/run.ts";
import { runAgentChatCompletions } from "../_shared/agent/chat_completions.ts";
import { scoreProduct, searchGroups } from "../_shared/agent/search.ts";
import type {
  Catalog,
  ChatMessage,
  ProductRecord,
} from "../_shared/agent/types.ts";

// Dev-only endpoint: chat with a store's agent without Meta.
//   curl -X POST $URL -H "x-playground-secret: $PLAYGROUND_SECRET" \
//     -d '{"store_id":"<uuid>","text":"do you have the black hoodie in M?"}'
// Disabled until PLAYGROUND_SECRET is set. Replaced by dashboard auth later.
//
// Provider (secrets): by default the Claude agent (ANTHROPIC_API_KEY, AGENT_MODEL).
// LLM_PROVIDER=openai-compatible uses LLM_BASE_URL + LLM_API_KEY + LLM_MODEL instead
// (e.g. a free model on TokenRouter) for cheap flow testing. Use fake data only there.

const PLAYGROUND_SECRET = Deno.env.get("PLAYGROUND_SECRET") ?? "";
const HISTORY_LIMIT = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
  );
}

// Compare digests so the comparison time doesn't depend on where strings differ.
async function safeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([sha256(a), sha256(b)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

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

function supabaseCatalog(client: SupabaseClient): Catalog {
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

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (
    !PLAYGROUND_SECRET ||
    !(await safeEqual(
      req.headers.get("x-playground-secret") ?? "",
      PLAYGROUND_SECRET,
    ))
  ) {
    return json({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const storeId = body.store_id;
  const sessionId = typeof body.session_id === "string" ? body.session_id : "default";
  if (typeof storeId !== "string" || !UUID.test(storeId)) {
    return json({ error: "store_id must be a uuid" }, 400);
  }
  if (!/^[\w-]{1,64}$/.test(sessionId)) {
    return json({ error: "session_id must be 1-64 chars of [A-Za-z0-9_-]" }, 400);
  }

  const { data: store, error: storeErr } = await db
    .from("stores")
    .select("id,name,currency,business_info")
    .eq("id", storeId)
    .maybeSingle();
  if (storeErr) throw storeErr;
  if (!store) return json({ error: "Store not found" }, 404);

  const { data: channel, error: chErr } = await db
    .from("channels")
    .upsert(
      {
        store_id: store.id,
        platform: "playground",
        external_id: store.id,
        display_name: "Playground",
      },
      { onConflict: "platform,external_id" },
    )
    .select("id")
    .single();
  if (chErr) throw chErr;

  const { data: customer, error: custErr } = await db
    .from("customers")
    .upsert(
      {
        store_id: store.id,
        channel_id: channel.id,
        platform_user_id: sessionId,
        display_name: `Playground ${sessionId}`,
      },
      { onConflict: "channel_id,platform_user_id" },
    )
    .select("id")
    .single();
  if (custErr) throw custErr;

  const { data: conversation, error: convErr } = await db
    .from("conversations")
    .upsert(
      {
        store_id: store.id,
        channel_id: channel.id,
        customer_id: customer.id,
        last_customer_message_at: new Date().toISOString(),
      },
      { onConflict: "channel_id,customer_id" },
    )
    .select("id,status")
    .single();
  if (convErr) throw convErr;

  // {"store_id": "...", "reset": true} puts the conversation back under the bot.
  if (body.reset === true) {
    await db.from("conversations")
      .update({ status: "bot", handoff_reason: null })
      .eq("id", conversation.id);
    return json({ status: "bot" });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text || text.length > 1000) {
    return json({ error: "text must be 1-1000 characters" }, 400);
  }

  const { data: inbound, error: inErr } = await db
    .from("messages")
    .insert({
      store_id: store.id,
      conversation_id: conversation.id,
      channel_id: channel.id,
      direction: "inbound",
      sender: "customer",
      body: text,
    })
    .select("id")
    .single();
  if (inErr) throw inErr;

  // Once handed to the owner the bot stays silent, exactly like production.
  if (conversation.status !== "bot") {
    return json({
      reply: null,
      status: conversation.status,
      note: 'Conversation is with the owner. Send {"store_id":"...","reset":true} to hand it back.',
    });
  }

  const useOpenAICompatible = Deno.env.get("LLM_PROVIDER") === "openai-compatible";
  const llm = {
    baseUrl: Deno.env.get("LLM_BASE_URL"),
    apiKey: Deno.env.get("LLM_API_KEY"),
    model: Deno.env.get("LLM_MODEL"),
  };
  const anthropicKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (useOpenAICompatible) {
    if (!llm.baseUrl || !llm.apiKey || !llm.model) {
      return json({ error: "LLM_BASE_URL, LLM_API_KEY and LLM_MODEL must be set" }, 500);
    }
  } else if (!anthropicKey) {
    return json({ error: "ANTHROPIC_API_KEY is not set" }, 500);
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

  const model = useOpenAICompatible
    ? llm.model!
    : Deno.env.get("AGENT_MODEL") ?? DEFAULT_MODEL;
  try {
    const catalog = supabaseCatalog(db);
    const result = useOpenAICompatible
      ? await runAgentChatCompletions({
        baseUrl: llm.baseUrl!,
        apiKey: llm.apiKey!,
        model,
        catalog,
        store,
        history,
      })
      : await runAgent({
        client: new Anthropic({ apiKey: anthropicKey }),
        catalog,
        store,
        history,
        model,
      });

    await db.from("messages").insert({
      store_id: store.id,
      conversation_id: conversation.id,
      channel_id: channel.id,
      direction: "outbound",
      sender: "agent",
      body: result.reply,
      delivery_status: "sent",
    });
    await db.from("agent_runs").insert({
      store_id: store.id,
      conversation_id: conversation.id,
      trigger_message_id: inbound.id,
      model: result.model,
      tool_calls: result.toolCalls,
      input_tokens: result.usage.input_tokens,
      output_tokens: result.usage.output_tokens,
    });
    if (result.handoffReason) {
      await db.from("conversations")
        .update({ status: "human", handoff_reason: result.handoffReason })
        .eq("id", conversation.id);
    }

    return json({
      reply: result.reply,
      handoff: result.handoffReason,
      tool_calls: result.toolCalls.map((t) => t.name),
      usage: result.usage,
      model: result.model,
    });
  } catch (err) {
    console.error("agent run failed", err);
    await db.from("agent_runs").insert({
      store_id: store.id,
      conversation_id: conversation.id,
      trigger_message_id: inbound.id,
      model,
      error: err instanceof Anthropic.APIError
        ? `${err.status}: ${err.message}`
        : String(err),
    });
    return json({ error: "Agent failed; see agent_runs for details" }, 502);
  }
});
