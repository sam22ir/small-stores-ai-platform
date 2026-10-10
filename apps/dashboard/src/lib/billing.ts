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
