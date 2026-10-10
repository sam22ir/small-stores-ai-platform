import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { getUsage, handleInbound, type RunSource } from "../_shared/pipeline.ts";

// Chat with a store's assistant from the dashboard ("Test your assistant") or from a dev script.
// POST JSON, three actions:
//   {"store_id", "text"}                 -> run the assistant on one message (default)
//   {"store_id", "action": "reset"}      -> put the test conversation back under the bot
//   {"store_id", "action": "usage"}      -> this month's reply count, conversations and limit
//
// Auth (verify_jwt is off; this function checks it itself):
//   - Owner: `Authorization: Bearer <user JWT>` of a member of the store. Source "test".
//   - Dev:   `x-playground-secret: $PLAYGROUND_SECRET`. Source "dev". Only for the stores listed in
//            PLAYGROUND_STORE_IDS (comma-separated uuids), so the shared secret can't reach real stores.
// Test and dev runs never create real orders, never touch stock and don't count towards
// the store's monthly limit. They are rate limited per store.

const PLAYGROUND_SECRET = Deno.env.get("PLAYGROUND_SECRET") ?? "";
const PLAYGROUND_STORE_IDS = new Set(
  (Deno.env.get("PLAYGROUND_STORE_IDS") ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean),
);
const TEST_RUNS_PER_HOUR = 60;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const CORS = {
  "access-control-allow-origin": "*", // bearer-token auth, no cookies
  "access-control-allow-headers":
    "authorization, content-type, x-playground-secret, apikey, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS },
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

interface Caller {
  source: RunSource;
  sessionId: string;
  userId: string | null;
}

// Returns the caller, or a Response to send back.
async function authenticate(
  req: Request,
  storeId: string,
  requestedSession: string,
): Promise<Caller | Response> {
  const secret = req.headers.get("x-playground-secret");
  if (secret !== null) {
    if (!PLAYGROUND_SECRET || !(await safeEqual(secret, PLAYGROUND_SECRET))) {
      return json({ error: "Unauthorized" }, 401);
    }
    if (!PLAYGROUND_STORE_IDS.has(storeId.toLowerCase())) {
      return json({ error: "This store is not in PLAYGROUND_STORE_IDS" }, 403);
    }
    if (!/^[\w-]{1,64}$/.test(requestedSession)) {
      return json({ error: "session_id must be 1-64 chars of [A-Za-z0-9_-]" }, 400);
    }
    return { source: "dev", sessionId: requestedSession, userId: null };
  }

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data, error } = await db.auth.getUser(token);
  if (error || !data.user) return json({ error: "Unauthorized" }, 401);

  const { data: member, error: memErr } = await db
    .from("store_members")
    .select("user_id")
    .eq("store_id", storeId)
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!member) return json({ error: "Forbidden" }, 403);
  // One test conversation per "New test chat" the owner starts.
  const sid = /^[a-z0-9]{1,16}$/.test(requestedSession) ? requestedSession : "main";
  return { source: "test", sessionId: `test-${data.user.id}-${sid}`, userId: data.user.id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const storeId = body.store_id;
  if (typeof storeId !== "string" || !UUID.test(storeId)) {
    return json({ error: "store_id must be a uuid" }, 400);
  }
  const action = typeof body.action === "string" ? body.action : "chat";
  if (!["chat", "reset", "usage"].includes(action)) {
    return json({ error: "Unknown action" }, 400);
  }

  try {
    const caller = await authenticate(
      req,
      storeId,
      typeof body.session_id === "string" ? body.session_id : "default",
    );
    if (caller instanceof Response) return caller;

    const { data: store, error: storeErr } = await db
      .from("stores")
      .select("id,name,currency,business_info,agent_enabled,monthly_reply_limit,orders_enabled")
      .eq("id", storeId)
      .maybeSingle();
    if (storeErr) throw storeErr;
    if (!store) return json({ error: "Store not found" }, 404);

    if (action === "usage") {
      return json({ usage: await getUsage(db, store.id, store.monthly_reply_limit) });
    }

    const { data: channel, error: chErr } = await db
      .from("channels")
      .upsert(
        {
          store_id: store.id,
          platform: "playground",
          external_id: store.id,
          display_name: "Test chat",
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
          platform_user_id: caller.sessionId,
          display_name: caller.userId ? "Test chat" : `Playground ${caller.sessionId}`,
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

    if (action === "reset") {
      await db.from("conversations")
        .update({ status: "bot", handoff_reason: null })
        .eq("id", conversation.id);
      return json({ status: "bot" });
    }

    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!text || text.length > 1000) {
      return json({ error: "text must be 1-1000 characters" }, 400);
    }

    // Test chats cost real tokens: cap them per store.
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const { count, error: rateErr } = await db
      .from("agent_runs")
      .select("id", { count: "exact", head: true })
      .eq("store_id", store.id)
      .in("source", ["test", "dev"])
      .gte("created_at", hourAgo);
    if (rateErr) throw rateErr;
    if ((count ?? 0) >= TEST_RUNS_PER_HOUR) {
      return json({ error: "Too many test messages. Try again later." }, 429);
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

    const result = await handleInbound({
      db,
      env: (k) => Deno.env.get(k),
      store,
      channelId: channel.id,
      conversation,
      customerId: customer.id,
      inboundMessageId: inbound.id,
      text,
      source: caller.source,
    });
    if (!result.ok) {
      // The detail can name missing secrets or providers: only the dev caller (who holds the secret) sees it.
      console.error("assistant-chat run failed", result.error);
      return json({ error: caller.source === "dev" ? result.error : "The assistant could not answer. Try again." }, 502);
    }
    return json(result);
  } catch (err) {
    console.error("assistant-chat failed", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
