import type { SupabaseClient } from "@supabase/supabase-js";

// Subscription billing: 1,000 DA per store per month, paid through Chargily Pay (V2 API).
// Reply-credit packs are bought the same way. Pure helpers (signature, gate) and the database writes.

export const PRICE_DZD = 1000;
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

// Reply-credit packs: pack size (credits) -> price in DZD. Server-side only: the client sends the
// pack size, never a price. Paid periods and credits are granted by SQL (apply_paid_checkout).
export const CREDIT_PACKS: Readonly<Record<string, number>> = { "500": 300, "2000": 1000, "5000": 2000 };

const enc = new TextEncoder();

// --- Webhook signature -------------------------------------------------------------------------
// Chargily sends HMAC-SHA256 (hex) of the raw request body, keyed with the secret key, in the
// `signature` header. Compared in constant time: both sides are hashed first so length doesn't leak.

export function toHex(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", enc.encode(a)),
    crypto.subtle.digest("SHA-256", enc.encode(b)),
  ]);
  const xa = new Uint8Array(x);
  const ya = new Uint8Array(y);
  let diff = 0;
  for (let i = 0; i < xa.length; i++) diff |= xa[i] ^ ya[i];
  return diff === 0;
}

export async function signatureMatches(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(rawBody)));
  return constantTimeEqual(toHex(mac), signature.trim().toLowerCase());
}

// --- Gate --------------------------------------------------------------------------------------

export interface BillingFields {
  trial_ends_at?: string | null;
  paid_until?: string | null;
  billing_alerted_for?: string | null;
}

export interface BillingState {
  blocked: boolean;
  // The instant the lapse took effect. Stored in stores.billing_alerted_for so the owner hears once.
  lapsedAt: string | null;
}

// The agent is allowed while the trial runs, or while a paid period (plus a 3-day grace) runs.
// Missing billing fields mean "not enforced" (only happens in tests and before the migration).
export function billingState(store: BillingFields, now: Date): BillingState {
  if (!store.trial_ends_at) return { blocked: false, lapsedAt: null };
  const trialEnd = new Date(store.trial_ends_at).getTime();
  const paidEnd = store.paid_until ? new Date(store.paid_until).getTime() + GRACE_DAYS * DAY_MS : null;
  const t = now.getTime();
  if (t < trialEnd) return { blocked: false, lapsedAt: null };
  if (paidEnd !== null && t < paidEnd) return { blocked: false, lapsedAt: null };
  const lapse = paidEnd === null ? trialEnd : Math.max(trialEnd, paidEnd);
  return { blocked: true, lapsedAt: new Date(lapse).toISOString() };
}

// Records that the owner was alerted about this lapse. True only for the first caller: the
// conditional update is the claim, so concurrent replies send one alert.
export async function claimBillingAlert(
  db: SupabaseClient,
  storeId: string,
  lapsedAt: string,
  current: string | null | undefined,
): Promise<boolean> {
  if (current === lapsedAt) return false;
  const base = db.from("stores").update({ billing_alerted_for: lapsedAt }).eq("id", storeId);
  const { data, error } = await (current
    ? base.eq("billing_alerted_for", current)
    : base.is("billing_alerted_for", null)
  ).select("id").maybeSingle();
  if (error) {
    console.error("billing alert claim failed", error.message);
    return false;
  }
  return !!data;
}

// --- Webhook: checkout.paid --------------------------------------------------------------------

export type PaidOutcome =
  | { result: "paid"; kind: "subscription"; store_id: string; paid_until: string }
  | { result: "paid"; kind: "credits"; store_id: string; reply_credits: number }
  | { result: "duplicate" }
  | { result: "unknown_checkout" };

// Idempotent on the checkout id. One SQL call (apply_paid_checkout) claims the payment and grants what
// it bought in a single transaction: a repeat is "duplicate", and a failure rolls the claim back so
// Chargily's retry finishes the job. Throws on a database error (the webhook then answers 500).
export async function applyCheckoutPaid(db: SupabaseClient, checkoutId: string): Promise<PaidOutcome> {
  const { data, error } = await db.rpc("apply_paid_checkout", { p_checkout_id: checkoutId });
  if (error) throw new Error(`apply_paid_checkout failed: ${error.message}`);
  const outcome = data as PaidOutcome | null;
  if (!outcome || typeof outcome.result !== "string") throw new Error("apply_paid_checkout returned no result");
  if (outcome.result === "unknown_checkout") {
    console.error(JSON.stringify({ event: "checkout_unknown", checkout_id: checkoutId }));
  }
  return outcome;
}

// checkout.failed / checkout.canceled: only moves a payment that is still pending.
export async function applyCheckoutClosed(
  db: SupabaseClient,
  checkoutId: string,
  status: "failed" | "canceled",
  now: Date,
): Promise<void> {
  const { error } = await db
    .from("payments")
    .update({ status, updated_at: now.toISOString() })
    .eq("checkout_id", checkoutId)
    .eq("status", "pending");
  if (error) throw error;
}
