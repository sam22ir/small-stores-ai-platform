import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { deliverPending } from "../_shared/meta/deliver.ts";

// Sends the messages waiting in one conversation. The dashboard calls it right after the owner
// writes a reply, because the owner's reply is saved by the browser and must still reach Instagram.
// POST {"conversation_id"} with the owner's JWT. Deployed with verify_jwt = false; it checks the
// JWT itself and that the caller is a member of the conversation's store.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const env = (k: string) => Deno.env.get(k);
const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

const CORS = {
  "access-control-allow-origin": "*", // bearer-token auth, no cookies
  "access-control-allow-headers": "authorization, content-type, apikey, x-client-info",
  "access-control-allow-methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...CORS } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ error: "Unauthorized" }, 401);
  const { data: auth, error: authErr } = await db.auth.getUser(token);
  if (authErr || !auth.user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const conversationId = body.conversation_id;
  if (typeof conversationId !== "string" || !UUID.test(conversationId)) {
    return json({ error: "conversation_id must be a uuid" }, 400);
  }

  try {
    const { data: conv, error: convErr } = await db
      .from("conversations").select("store_id").eq("id", conversationId).maybeSingle();
    if (convErr) throw convErr;
    const { data: member, error: memErr } = conv
      ? await db.from("store_members").select("user_id").eq("store_id", conv.store_id).eq("user_id", auth.user.id).maybeSingle()
      : { data: null, error: null };
    if (memErr) throw memErr;
    // Same answer for "no such chat" and "not yours", so ids can't be probed.
    if (!conv || !member) return json({ error: "Not found" }, 404);

    return json(await deliverPending({ db, env }, conversationId));
  } catch (err) {
    console.error("deliver-messages failed", err);
    return json({ error: "Something went wrong" }, 500);
  }
});
