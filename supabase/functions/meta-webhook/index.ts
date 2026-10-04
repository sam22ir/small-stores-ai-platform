import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Receives Messenger (Facebook Page) and Instagram DM webhooks from Meta.
// Verifies the signature, dedupes retries, resolves the store from the connected
// channel, and persists the inbound message. The agent worker picks it up from there.
// Auth is the HMAC signature, so this function is deployed with verify_jwt = false.

const APP_SECRET = Deno.env.get("META_APP_SECRET") ?? "";
const VERIFY_TOKEN = Deno.env.get("META_WEBHOOK_VERIFY_TOKEN") ?? "";

const db = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type MessagingEvent = {
  sender?: { id: string };
  recipient?: { id: string };
  timestamp?: number;
  message?: {
    mid?: string;
    text?: string;
    is_echo?: boolean;
    attachments?: unknown[];
  };
};

type WebhookBody = {
  object?: string;
  entry?: { id: string; messaging?: MessagingEvent[] }[];
};

const encoder = new TextEncoder();

async function validSignature(rawBody: string, header: string | null) {
  if (!APP_SECRET || !header?.startsWith("sha256=")) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(APP_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const expected = header.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(expected)) return false;
  const sig = Uint8Array.from(
    expected.match(/../g)!.map((h) => parseInt(h, 16)),
  );
  // crypto.subtle.verify compares in constant time.
  return crypto.subtle.verify("HMAC", key, sig, encoder.encode(rawBody));
}

async function handleEvent(
  platform: "facebook" | "instagram",
  externalId: string,
  event: MessagingEvent,
) {
  const msg = event.message;
  // Only inbound customer messages for v0. Echoes are the business's own sends.
  if (!msg?.mid || msg.is_echo || !event.sender?.id) return;

  const { data: channel, error: channelErr } = await db
    .from("channels")
    .select("id, store_id")
    .eq("platform", platform)
    .eq("external_id", externalId)
    .eq("status", "active")
    .maybeSingle();
  if (channelErr) throw channelErr;
  if (!channel) {
    console.warn(`No active channel for ${platform}:${externalId}`);
    return;
  }

  const { data: customer, error: customerErr } = await db
    .from("customers")
    .upsert(
      {
        store_id: channel.store_id,
        channel_id: channel.id,
        platform_user_id: event.sender.id,
      },
      { onConflict: "channel_id,platform_user_id" },
    )
    .select("id")
    .single();
  if (customerErr) throw customerErr;

  const sentAt = new Date(event.timestamp ?? Date.now()).toISOString();
  const { data: conversation, error: convErr } = await db
    .from("conversations")
    .upsert(
      {
        store_id: channel.store_id,
        channel_id: channel.id,
        customer_id: customer.id,
        last_customer_message_at: sentAt,
      },
      { onConflict: "channel_id,customer_id" },
    )
    .select("id")
    .single();
  if (convErr) throw convErr;

  const { error: msgErr } = await db.from("messages").insert({
    store_id: channel.store_id,
    conversation_id: conversation.id,
    channel_id: channel.id,
    direction: "inbound",
    sender: "customer",
    body: msg.text ?? (msg.attachments?.length ? "[attachment]" : null),
    platform_message_id: msg.mid,
  });
  // 23505 = unique violation: Meta retried a message we already stored.
  if (msgErr && msgErr.code !== "23505") throw msgErr;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta's one-time endpoint verification handshake.
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      VERIFY_TOKEN !== "" &&
      url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return ok
      ? new Response(url.searchParams.get("hub.challenge") ?? "", {
        status: 200,
      })
      : new Response("Forbidden", { status: 403 });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const rawBody = await req.text();
  if (!await validSignature(rawBody, req.headers.get("x-hub-signature-256"))) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const platform = body.object === "instagram"
    ? "instagram"
    : body.object === "page"
    ? "facebook"
    : null;
  if (!platform) return new Response("Ignored", { status: 200 });

  let failed = false;
  for (const entry of body.entry ?? []) {
    for (const event of entry.messaging ?? []) {
      try {
        await handleEvent(platform, entry.id, event);
      } catch (err) {
        failed = true;
        console.error("webhook event failed", err);
      }
    }
  }

  // Non-2xx makes Meta retry; inserts are idempotent so retries are safe.
  return new Response(failed ? "Error" : "OK", { status: failed ? 500 : 200 });
});
