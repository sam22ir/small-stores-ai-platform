import type { SupabaseClient } from "@supabase/supabase-js";

// Subscription billing: 1,000 DA per store per month, paid through Chargily Pay (V2 API).
// Pure helpers (signature, period math, gate) and the database writes the functions need.

export const PRICE_DZD = 1000;
export const PERIOD_DAYS = 30;
export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

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

// --- Period math -------------------------------------------------------------------------------

// A payment extends the paid period by 30 days from the later of now and the current paid_until,
// so paying early never loses the days already bought.
export function computePaidUntil(currentPaidUntil: Date | null, now: Date): Date {
  const start = currentPaidUntil && currentPaidUntil.getTime() > now.getTime() ? currentPaidUntil : now;
  return new Date(start.getTime() + PERIOD_DAYS * DAY_MS);
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
  | { result: "paid"; storeId: string; paidUntil: string }
  | { result: "duplicate" }
  | { result: "unknown_checkout" };

// Idempotent on the checkout id. The pending -> paid change is a conditional update, so only one
// delivery wins it and extends the period. If extending fails, the payment goes back to pending so
// Chargily's retry can finish the job.
export async function applyCheckoutPaid(db: SupabaseClient, checkoutId: string, now: Date): Promise<PaidOutcome> {
  const { data: claimed, error: claimErr } = await db
    .from("payments")
    .update({ status: "paid", updated_at: now.toISOString() })
    .eq("checkout_id", checkoutId)
    .eq("status", "pending")
    .select("store_id")
    .maybeSingle();
  if (claimErr) throw claimErr;
  if (!claimed) {
    const { data: existing, error: findErr } = await db
      .from("payments").select("id").eq("checkout_id", checkoutId).maybeSingle();
    if (findErr) throw findErr;
    return existing ? { result: "duplicate" } : { result: "unknown_checkout" };
  }

  const storeId = (claimed as { store_id: string }).store_id;
  try {
    const paidUntil = await extendPaidUntil(db, storeId, now);
    return { result: "paid", storeId, paidUntil };
  } catch (err) {
    await db.from("payments").update({ status: "pending" }).eq("checkout_id", checkoutId);
    throw err;
  }
}

// Two payments for one store can land at once, so the write only succeeds if paid_until is still
// what was read. Retries a few times, then gives up (the caller rolls the payment back).
async function extendPaidUntil(db: SupabaseClient, storeId: string, now: Date): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: row, error } = await db.from("stores").select("paid_until").eq("id", storeId).maybeSingle();
    if (error) throw error;
    if (!row) throw new Error("store not found for payment");
    const current = (row as { paid_until: string | null }).paid_until;
    const next = computePaidUntil(current ? new Date(current) : null, now).toISOString();
    const base = db.from("stores").update({ plan_status: "active", paid_until: next }).eq("id", storeId);
    const { data: updated, error: updErr } = await (current
      ? base.eq("paid_until", current)
      : base.is("paid_until", null)
    ).select("id").maybeSingle();
    if (updErr) throw updErr;
    if (updated) return next;
  }
  throw new Error("paid_until update kept losing a race");
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
