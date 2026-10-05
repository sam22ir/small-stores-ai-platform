import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { handleInbound } from "../_shared/pipeline.ts";
import { decryptSecret } from "../_shared/meta/crypto.ts";
import { deliverPending } from "../_shared/meta/deliver.ts";
import { ingestEvent } from "../_shared/meta/ingest.ts";
import { getUserName } from "../_shared/meta/instagram.ts";
import { parseWebhook, validSignature } from "../_shared/meta/webhook.ts";

// Receives Instagram (and later Messenger) DM webhooks from Meta.
// Verifies the signature, answers 200 at once, and does the real work in the background:
// store the message, run the assistant, send the reply (see _shared/meta/ingest.ts).
// Auth is the HMAC signature, so this function is deployed with verify_jwt = false.
//
// Secrets: META_WEBHOOK_VERIFY_TOKEN, INSTAGRAM_APP_SECRET (and META_APP_SECRET for a Facebook
// app), CREDENTIALS_ENCRYPTION_KEY, plus the LLM_* secrets used by the assistant.

// Supabase's runtime lets a function keep working after it has answered.
const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;

const env = (k: string) => Deno.env.get(k);
const VERIFY_TOKEN = env("META_WEBHOOK_VERIFY_TOKEN") ?? "";

const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

async function lookupName(channelId: string, senderId: string): Promise<string | null> {
  const { data, error } = await db
    .from("channel_credentials")
    .select("access_token_encrypted")
    .eq("channel_id", channelId)
    .maybeSingle();
  if (error || !data) return null;
  const token = await decryptSecret(data.access_token_encrypted, env("CREDENTIALS_ENCRYPTION_KEY"));
  return getUserName(token, senderId, env("META_GRAPH_API_VERSION"));
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // Meta's one-time endpoint verification handshake.
  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" &&
      VERIFY_TOKEN !== "" &&
      url.searchParams.get("hub.verify_token") === VERIFY_TOKEN;
    return ok
      ? new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 })
      : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawBody = await req.text();
  const signed = await validSignature(rawBody, req.headers.get("x-hub-signature-256"), [
    env("INSTAGRAM_APP_SECRET"),
    env("META_APP_SECRET"),
  ]);
  if (!signed) return new Response("Invalid signature", { status: 401 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const events = parseWebhook(body);
  if (events.length) {
    const work = Promise.allSettled(events.map(async (event) => {
      try {
        await ingestEvent({
          db,
          env,
          handle: handleInbound,
          deliver: (conversationId) => deliverPending({ db, env }, conversationId),
          lookupName: event.platform === "instagram" ? lookupName : undefined,
        }, event);
      } catch (err) {
        console.error("webhook event failed", event.platform, event.mid, err);
      }
    }));
    // Meta wants a 200 within a few seconds; the assistant takes longer. Keep running after replying.
    if (edgeRuntime) edgeRuntime.waitUntil(work);
    else await work;
  }
  return new Response("OK", { status: 200 });
});
