import type { SupabaseClient } from "@supabase/supabase-js";

// Telegram alerts to the store owner.
//   - sendTelegram: one message through the Bot API. Never throws; a failed alert must not hurt a reply.
//   - notifyOwner: sends to the store's linked chat, if the owner linked one and TELEGRAM_BOT_TOKEN is set.
//   - handleTelegramUpdate: the webhook side. "/start <code>" links the chat that sent it to a store.
// Without TELEGRAM_BOT_TOKEN everything here is a silent no-op.

export type FetchFn = typeof fetch;

const SEND_TIMEOUT_MS = 5000;
const MAX_TEXT = 4000; // Telegram's limit is 4096 characters

export async function sendTelegram(
  token: string | undefined,
  chatId: number | string,
  text: string,
  fetchImpl: FetchFn = (...args) => fetch(...args),
): Promise<boolean> {
  if (!token) return false;
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: text.length > MAX_TEXT ? text.slice(0, MAX_TEXT - 1) + "…" : text,
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error("telegram sendMessage failed", res.status);
      return false;
    }
    return true;
  } catch (err) {
    // Don't log the error object: fetch errors can carry the request URL, and that contains the token.
    console.error("telegram sendMessage error", err instanceof Error ? err.name : "unknown");
    return false;
  }
}

export async function notifyOwner(
  db: SupabaseClient,
  env: (key: string) => string | undefined,
  storeId: string,
  text: string,
  fetchImpl?: FetchFn,
): Promise<boolean> {
  const token = env("TELEGRAM_BOT_TOKEN");
  if (!token) return false;
  try {
    const { data, error } = await db
      .from("store_telegram")
      .select("chat_id")
      .eq("store_id", storeId)
      .maybeSingle();
    if (error) throw error;
    const chatId = data?.chat_id;
    if (chatId === null || chatId === undefined) return false;
    return await sendTelegram(token, chatId, text, fetchImpl);
  } catch (err) {
    console.error("notifyOwner failed", err instanceof Error ? err.message : "unknown");
    return false;
  }
}

// "/start <code>" (optionally "/start@BotName <code>"). Returns the code, or null for anything else.
export function parseStartCode(text: string | null | undefined): string | null {
  const m = /^\/start(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9_-]{8,64})\s*$/.exec((text ?? "").trim());
  return m ? m[1] : null;
}

// Constant-time comparison of Telegram's X-Telegram-Bot-Api-Secret-Token header with our secret.
// An unset secret never matches, so a missing config rejects every request.
export function webhookSecretOk(header: string | null, expected: string | undefined): boolean {
  if (!expected || !header) return false;
  const enc = new TextEncoder();
  const a = enc.encode(header);
  const b = enc.encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

export interface TelegramUpdate {
  message?: { text?: string; chat?: { id?: number } };
}

export type LinkOutcome = "linked" | "unknown_code" | "ignored";

// Handles one update from Telegram. Codes are one-time: a successful link clears the code.
export async function handleTelegramUpdate(
  db: SupabaseClient,
  token: string | undefined,
  update: TelegramUpdate,
  fetchImpl?: FetchFn,
): Promise<LinkOutcome> {
  if (!token) return "ignored";
  const chatId = update?.message?.chat?.id;
  const code = parseStartCode(update?.message?.text);
  if (typeof chatId !== "number" || !code) return "ignored";

  const { data: link, error } = await db
    .from("store_telegram")
    .update({ chat_id: chatId, link_code: null, updated_at: new Date().toISOString() })
    .eq("link_code", code)
    .select("store_id")
    .maybeSingle();
  if (error) throw error;
  const { data: store, error: storeErr } = link
    ? await db.from("stores").select("name").eq("id", link.store_id).maybeSingle()
    : { data: null, error: null };
  if (storeErr) throw storeErr;

  if (!link || !store) {
    await sendTelegram(
      token,
      chatId,
      "That link has expired. Get a new one from the dashboard.",
      fetchImpl,
    );
    return "unknown_code";
  }
  await sendTelegram(
    token,
    chatId,
    `Connected: you'll get alerts for ${store.name as string}.`,
    fetchImpl,
  );
  return "linked";
}
