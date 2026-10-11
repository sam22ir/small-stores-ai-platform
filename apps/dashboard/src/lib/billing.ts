// What the Settings billing card shows. Mirrors the server gate in supabase/functions/_shared/billing.ts:
// the trial, then the paid period, then a 3-day grace after a paid period ends.

export const GRACE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface BillingFields {
  trial_ends_at: string;
  paid_until: string | null;
}

export type BillingStatus = "trial" | "active" | "grace" | "expired";

export interface BillingView {
  status: BillingStatus;
  // Trial end while on trial, paid-until once paid, otherwise the date the lapse began.
  endsAt: string;
  daysLeft: number;
}

export function billingView(store: BillingFields, now = new Date()): BillingView {
  const t = now.getTime();
  const trialEnd = new Date(store.trial_ends_at).getTime();
  const paidEnd = store.paid_until ? new Date(store.paid_until).getTime() : null;

  let status: BillingStatus;
  let endsAt: number;
  if (paidEnd !== null && t < paidEnd) {
    status = "active";
    endsAt = paidEnd;
  } else if (t < trialEnd) {
    status = "trial";
    endsAt = trialEnd;
  } else if (paidEnd !== null && t < paidEnd + GRACE_DAYS * DAY_MS) {
    status = "grace";
    endsAt = paidEnd;
  } else {
    status = "expired";
    endsAt = paidEnd ?? trialEnd;
  }
  const daysLeft = Math.max(0, Math.ceil((endsAt - t) / DAY_MS));
  return { status, endsAt: new Date(endsAt).toISOString(), daysLeft };
}

// Reply credit packs (see supabase/migrations/0023_reply_credits.sql). The price is set server-side in
// supabase/functions/billing-checkout; the client only sends the pack size. Prices are in DZD.
export interface ReplyPack {
  credits: number;
  price: number;
}

export const REPLY_PACKS: readonly ReplyPack[] = [
  { credits: 500, price: 300 },
  { credits: 2000, price: 1000 },
  { credits: 5000, price: 2000 },
];

// Price of one reply in DZD, e.g. 300 / 500 = 0.6.
export function pricePerReply(pack: ReplyPack): number {
  return pack.price / pack.credits;
}

// A DA amount formatted for a locale, with the given number of decimals.
export function formatDa(amount: number, locale: string, fractionDigits = 0): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
