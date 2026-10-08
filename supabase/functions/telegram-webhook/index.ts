import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "@supabase/supabase-js";
import { handleTelegramUpdate, type TelegramUpdate, webhookSecretOk } from "../_shared/telegram.ts";

// Receives updates from the Telegram bot (set with setWebhook, see docs/instagram-setup.md).
// Authenticated by the secret token Telegram sends back in X-Telegram-Bot-Api-Secret-Token, so this
// function is deployed with verify_jwt = false. Answers 200 at once; the link is done in the background.
//
// Secrets: TELEGRAM_BOT_TOKEN (no token = nothing happens), TELEGRAM_WEBHOOK_SECRET.

// Supabase's runtime lets a function keep working after it has answered.
const edgeRuntime = (globalThis as { EdgeRuntime?: { waitUntil(p: Promise<unknown>): void } }).EdgeRuntime;

const env = (k: string) => Deno.env.get(k);

const db = createClient(env("SUPABASE_URL")!, env("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });
  if (!webhookSecretOk(req.headers.get("x-telegram-bot-api-secret-token"), env("TELEGRAM_WEBHOOK_SECRET"))) {
    return new Response("Forbidden", { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = await req.json();
  } catch {
    // Authenticated but unreadable: answer 200 so Telegram does not keep retrying it.
    return new Response("OK", { status: 200 });
  }

  const work = handleTelegramUpdate(db, env("TELEGRAM_BOT_TOKEN"), update).catch((err) => {
    console.error("telegram update failed", err instanceof Error ? err.message : "unknown");
  });
  if (edgeRuntime) edgeRuntime.waitUntil(work);
  else await work;
  return new Response("OK", { status: 200 });
});
