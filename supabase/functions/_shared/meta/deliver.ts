import type { SupabaseClient } from "@supabase/supabase-js";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { MetaApiError, refreshLongLived, sendImage, sendText, splitForInstagram } from "./instagram.ts";
import { isStorePhotoUrl, photoPrefix } from "../agent/tools/photo.ts";

// Sends the replies waiting in a conversation (delivery_status = 'pending') to Instagram.
// Called right after the assistant answers and when the owner replies from the dashboard.
//
// Safe to run twice at once: each message is claimed atomically before it is sent, so a reply
// is never delivered twice. A message that can't be delivered is marked 'failed' with the reason
// so the owner sees it, instead of silently disappearing.

const WINDOW_MS = 24 * 3600 * 1000; // Meta's standard messaging window
const REFRESH_WITHIN_MS = 10 * 24 * 3600 * 1000; // refresh a 60-day token in its last 10 days
// A claim older than this belongs to a delivery that was killed mid-send (e.g. the function hit its
// time limit). Such a message is claimed again, so it is retried or marked failed instead of stuck.
export const CLAIM_STALE_MS = 120_000;

export interface DeliverDeps {
  db: SupabaseClient;
  env: (key: string) => string | undefined;
  now?: Date;
}

export interface DeliverResult {
  sent: number;
  failed: number;
  skipped: number;
}

const short = (s: string) => s.replace(/\s+/g, " ").slice(0, 300);

async function markFailed(db: SupabaseClient, id: string, reason: string) {
  const { error } = await db.from("messages").update({ delivery_status: "failed", delivery_error: short(reason) }).eq("id", id);
  if (error) console.error("could not mark message failed", id, error);
}

// One retry when Instagram itself errors (5xx): the message was not accepted, so trying again can't
// duplicate it. Network failures and timeouts are NOT retried, because the first attempt may have
// gone through.
async function withRetry<T>(send: () => Promise<T>): Promise<T> {
  try {
    return await send();
  } catch (err) {
    if (!(err instanceof MetaApiError) || err.status < 500) throw err;
    await new Promise((r) => setTimeout(r, 1000));
    return await send();
  }
}

// The first image link of an outbound photo row (attachments written by the reply pipeline).
function firstImageUrl(attachments: unknown): string | null {
  if (!Array.isArray(attachments)) return null;
  for (const a of attachments as { type?: unknown; url?: unknown }[]) {
    if (a?.type === "image" && typeof a.url === "string") return a.url;
  }
  return null;
}

export async function deliverPending(deps: DeliverDeps, conversationId: string): Promise<DeliverResult> {
  const { db, env } = deps;
  const now = deps.now ?? new Date();
  const result: DeliverResult = { sent: 0, failed: 0, skipped: 0 };
  // Unclaimed, or claimed by a delivery that stopped long enough ago to be presumed dead.
  const claimable = `delivery_claimed_at.is.null,delivery_claimed_at.lt.${new Date(now.getTime() - CLAIM_STALE_MS).toISOString()}`;

  const { data: pending, error: pendErr } = await db
    .from("messages")
    .select("id,body,attachments,store_id")
    .eq("conversation_id", conversationId)
    .eq("direction", "outbound")
    .eq("delivery_status", "pending")
    .or(claimable)
    .order("created_at", { ascending: true })
    .limit(20);
  if (pendErr) throw pendErr;
  if (!pending?.length) return result;

  const { data: conv, error: convErr } = await db
    .from("conversations")
    .select("id,channel_id,customer_id,last_customer_message_at")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) throw convErr;
  if (!conv) return result;

  const [{ data: channel, error: chErr }, { data: customer, error: cuErr }] = await Promise.all([
    db.from("channels").select("id,platform,status").eq("id", conv.channel_id).maybeSingle(),
    db.from("customers").select("platform_user_id").eq("id", conv.customer_id).maybeSingle(),
  ]);
  if (chErr) throw chErr;
  if (cuErr) throw cuErr;

  const failAll = async (reason: string, status: "failed" | "skipped" = "failed") => {
    for (const m of pending) {
      const { error } = await db.from("messages")
        .update(status === "failed"
          ? { delivery_status: "failed", delivery_error: short(reason) }
          : { delivery_status: "skipped", delivery_error: short(reason) })
        .eq("id", m.id).eq("delivery_status", "pending").is("delivery_claimed_at", null);
      if (error) console.error("could not update message", m.id, error);
      result[status === "failed" ? "failed" : "skipped"]++;
    }
    return result;
  };

  if (!channel || !customer) return failAll("The conversation's channel or customer no longer exists.");
  // Test chats never leave the platform.
  if (channel.platform === "playground") return failAll("Test chat", "skipped");
  if (channel.platform !== "instagram") return failAll("Replying on this channel is not available yet.");
  if (channel.status !== "active") return failAll("Instagram is disconnected. Connect it again in Assistant → Channels.");

  const last = conv.last_customer_message_at ? new Date(conv.last_customer_message_at).getTime() : 0;
  if (now.getTime() - last > WINDOW_MS) {
    return failAll("More than 24 hours since the customer's last message: Instagram only allows a reply within 24 hours.");
  }

  const { data: cred, error: credErr } = await db
    .from("channel_credentials")
    .select("access_token_encrypted,token_expires_at")
    .eq("channel_id", channel.id)
    .maybeSingle();
  if (credErr) throw credErr;
  if (!cred) return failAll("No Instagram access token. Connect Instagram again in Assistant → Channels.");

  const key = env("CREDENTIALS_ENCRYPTION_KEY");
  const version = env("META_GRAPH_API_VERSION");
  let token: string;
  try {
    token = await decryptSecret(cred.access_token_encrypted, key);
  } catch (err) {
    console.error("token decrypt failed", err);
    return failAll("The stored Instagram token can't be read. Connect Instagram again.");
  }

  // Keep the token alive: tokens last 60 days and can be refreshed while still valid.
  const expires = cred.token_expires_at ? new Date(cred.token_expires_at).getTime() : null;
  if (expires !== null && expires - now.getTime() < REFRESH_WITHIN_MS && expires > now.getTime()) {
    try {
      const fresh = await refreshLongLived(token, now);
      token = fresh.accessToken;
      await db.from("channel_credentials").update({
        access_token_encrypted: await encryptSecret(token, key),
        token_expires_at: fresh.expiresAt.toISOString(),
        updated_at: now.toISOString(),
      }).eq("channel_id", channel.id);
    } catch (err) {
      // The current token still works for now; try again on the next send.
      console.warn("token refresh failed", err instanceof Error ? err.message : err);
    }
  }

  for (const m of pending) {
    // Claim it. If another delivery already did, there is nothing for us to do.
    const { data: claimed, error: claimErr } = await db
      .from("messages")
      .update({ delivery_claimed_at: now.toISOString() })
      .eq("id", m.id)
      .eq("delivery_status", "pending")
      .or(claimable)
      .select("id");
    if (claimErr) throw claimErr;
    if (!claimed?.length) continue;

    // What to send: a text (split to Instagram's limit), or one product photo with no text.
    let send: () => Promise<string | null>;
    if (m.body) {
      const chunks = splitForInstagram(m.body);
      if (!chunks.length) {
        await markFailed(db, m.id, "Empty message");
        result.failed++;
        continue;
      }
      send = async () => {
        let firstId: string | null = null;
        for (const chunk of chunks) {
          const { messageId } = await withRetry(() => sendText(token, customer.platform_user_id, chunk, version));
          firstId ??= messageId;
        }
        return firstId;
      };
    } else {
      const photo = firstImageUrl(m.attachments);
      if (!photo) {
        await markFailed(db, m.id, "Empty message");
        result.failed++;
        continue;
      }
      // Checked again before sending: only this store's product photos may leave the system.
      if (!isStorePhotoUrl(photo, photoPrefix(env("SUPABASE_URL"), m.store_id))) {
        await markFailed(db, m.id, "This photo link is not one of this store's product photos, so it was not sent.");
        result.failed++;
        continue;
      }
      send = async () =>
        (await withRetry(() => sendImage(token, customer.platform_user_id, photo, version))).messageId;
    }

    try {
      const firstId = await send();
      const { error } = await db.from("messages")
        .update({ delivery_status: "sent", delivery_error: null, platform_message_id: firstId })
        .eq("id", m.id);
      if (error) console.error("sent but could not record it", m.id, error);
      result.sent++;
    } catch (err) {
      const apiErr = err instanceof MetaApiError ? err : null;
      let reason = apiErr ? `Instagram refused the message: ${apiErr.message}` : "Could not reach Instagram. Try again.";
      if (apiErr?.windowClosed) reason = "Instagram only allows a reply within 24 hours of the customer's last message.";
      if (apiErr?.tokenInvalid) {
        reason = "The Instagram connection expired. Connect Instagram again in Assistant → Channels.";
        await db.from("channels").update({ status: "disconnected" }).eq("id", channel.id);
      }
      console.error("instagram send failed", apiErr?.code ?? "", apiErr?.message ?? err);
      await markFailed(db, m.id, reason);
      result.failed++;
    }
  }
  return result;
}
