import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret } from "./crypto.ts";
import {
  exchangeCode,
  getProfile,
  type InstagramConfig,
  subscribeToMessages,
  toLongLived,
} from "./instagram.ts";
import { verifyState } from "./state.ts";

// The return leg of "Connect Instagram": Instagram sends the browser back with a one-time code,
// and the dashboard posts it here with the owner's JWT. We trust only a valid signed state made for
// that same signed-in person, re-check that they are still an owner of the store, exchange the code
// for a 60-day token, and save the account with its token encrypted.
// Requiring the caller to be the person who started the login stops a "connect my account to your
// store" link: an owner of store A can't send their approval link to someone else and have that
// person's Instagram account land in store A.

export type ConnectFailure =
  | "denied" // the owner cancelled on Instagram
  | "invalid_state" // forged, expired or missing state, or started by someone else
  | "not_owner" // no longer an owner of that store
  | "already_connected" // this Instagram account belongs to another store
  | "instagram_error" // Instagram refused the code or the token
  | "server_error"; // our side is misconfigured (for example an unusable encryption key)

export type ConnectResult =
  | { ok: true; channelId: string; username: string | null; warning?: "subscribe_failed" }
  | { ok: false; reason: ConnectFailure };

export interface ConnectDeps {
  db: SupabaseClient;
  cfg: InstagramConfig;
  stateSecret: string;
  encryptionKey: string | undefined;
  now?: Date;
}

export async function completeInstagramConnect(
  deps: ConnectDeps,
  params: { code: string | null; state: string | null; error?: string | null; userId: string },
): Promise<ConnectResult> {
  const { db, cfg } = deps;
  const now = deps.now ?? new Date();

  const state = params.state ? await verifyState(params.state, deps.stateSecret, now.getTime()) : null;
  if (!state || state.user_id !== params.userId) return { ok: false, reason: "invalid_state" };
  if (params.error || !params.code) return { ok: false, reason: "denied" };

  const { data: member, error: memErr } = await db
    .from("store_members")
    .select("role")
    .eq("store_id", state.store_id)
    .eq("user_id", state.user_id)
    .maybeSingle();
  if (memErr) throw memErr;
  if (!member || member.role !== "owner") return { ok: false, reason: "not_owner" };

  let token: string;
  let expiresAt: Date;
  let accountId: string;
  let username: string | null;
  try {
    // Instagram can append "#_" to the code; it is not part of it.
    const short = await exchangeCode(cfg, params.code.replace(/#_$/, ""));
    const long = await toLongLived(cfg, short.accessToken, now);
    const profile = await getProfile(long.accessToken, cfg.graphVersion);
    token = long.accessToken;
    expiresAt = long.expiresAt;
    accountId = profile.accountId;
    username = profile.username;
  } catch (err) {
    console.error("instagram connect failed", err instanceof Error ? err.message : err);
    return { ok: false, reason: "instagram_error" };
  }

  const { data: existing, error: exErr } = await db
    .from("channels")
    .select("id,store_id")
    .eq("platform", "instagram")
    .eq("external_id", accountId)
    .maybeSingle();
  if (exErr) throw exErr;
  // One Instagram account serves one store. Moving it would also orphan the old store's chats.
  if (existing && existing.store_id !== state.store_id) return { ok: false, reason: "already_connected" };

  // Encrypt before saving anything, so a bad CREDENTIALS_ENCRYPTION_KEY can't leave an
  // account half connected (a channel without a token).
  let encryptedToken: string;
  try {
    encryptedToken = await encryptSecret(token, deps.encryptionKey);
  } catch (err) {
    console.error("token encryption failed (check CREDENTIALS_ENCRYPTION_KEY)", err instanceof Error ? err.message : err);
    return { ok: false, reason: "server_error" };
  }

  const { data: channel, error: chErr } = await db
    .from("channels")
    .upsert(
      {
        store_id: state.store_id,
        platform: "instagram",
        external_id: accountId,
        display_name: username ? `@${username}` : null,
        status: "active",
      },
      { onConflict: "platform,external_id" },
    )
    .select("id")
    .single();
  if (chErr) throw chErr;

  const { error: credErr } = await db.from("channel_credentials").upsert(
    {
      channel_id: channel.id,
      access_token_encrypted: encryptedToken,
      token_expires_at: expiresAt.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "channel_id" },
  );
  if (credErr) throw credErr;

  // Ask Instagram to send this account's messages to our webhook.
  try {
    await subscribeToMessages(token, cfg.graphVersion);
  } catch (err) {
    console.error("webhook subscription failed", err instanceof Error ? err.message : err);
    return { ok: true, channelId: channel.id, username, warning: "subscribe_failed" };
  }
  return { ok: true, channelId: channel.id, username };
}

// Disconnecting stops replies at once: the channel no longer matches incoming messages and its
// token is deleted. Chat history stays.
export async function disconnectChannel(db: SupabaseClient, storeId: string, channelId: string): Promise<boolean> {
  const { data: channel, error } = await db
    .from("channels")
    .select("id")
    .eq("id", channelId)
    .eq("store_id", storeId)
    .maybeSingle();
  if (error) throw error;
  if (!channel) return false;
  const { error: updErr } = await db.from("channels").update({ status: "disconnected" }).eq("id", channelId);
  if (updErr) throw updErr;
  const { error: delErr } = await db.from("channel_credentials").delete().eq("channel_id", channelId);
  if (delErr) throw delErr;
  return true;
}
