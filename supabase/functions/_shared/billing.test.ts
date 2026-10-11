import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyCheckoutClosed,
  applyCheckoutPaid,
  billingState,
  claimBillingAlert,
  computePaidUntil,
  signatureMatches,
  toHex,
} from "./billing.ts";
import { memDb, type Tables } from "./testing/memdb.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-10T12:00:00.000Z");
const SECRET = "test_sk_not_a_real_key";

async function hmacHex(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body))));
}

// --- Signature ---------------------------------------------------------------------------------

test("signature: accepts the HMAC-SHA256 hex of the raw body", async () => {
  const body = '{"type":"checkout.paid","data":{"id":"ch_1"}}';
  assert.equal(await signatureMatches(body, await hmacHex(body, SECRET), SECRET), true);
});

test("signature: accepts upper-case hex and surrounding whitespace", async () => {
  const body = "{}";
  const sig = (await hmacHex(body, SECRET)).toUpperCase();
  assert.equal(await signatureMatches(body, `  ${sig} `, SECRET), true);
});

test("signature: rejects a changed body", async () => {
  const sig = await hmacHex('{"amount":1000}', SECRET);
  assert.equal(await signatureMatches('{"amount":1}', sig, SECRET), false);
});

test("signature: rejects the wrong secret, a missing header, an empty secret and a short signature", async () => {
  const body = "{}";
  const good = await hmacHex(body, SECRET);
  assert.equal(await signatureMatches(body, await hmacHex(body, "other"), SECRET), false);
  assert.equal(await signatureMatches(body, null, SECRET), false);
  assert.equal(await signatureMatches(body, good, ""), false);
  assert.equal(await signatureMatches(body, good.slice(0, 10), SECRET), false);
  assert.equal(await signatureMatches(body, "", SECRET), false);
});

// --- Period math -------------------------------------------------------------------------------

test("paid_until: first payment starts from now and adds 30 days", () => {
  const until = computePaidUntil(null, NOW);
  assert.equal(until.getTime(), NOW.getTime() + 30 * DAY);
});

test("paid_until: a payment made early adds to the time still left", () => {
  const current = new Date(NOW.getTime() + 10 * DAY);
  assert.equal(computePaidUntil(current, NOW).getTime(), current.getTime() + 30 * DAY);
});

test("paid_until: an expired period restarts from now, not from the old end date", () => {
  const expired = new Date(NOW.getTime() - 20 * DAY);
  assert.equal(computePaidUntil(expired, NOW).getTime(), NOW.getTime() + 30 * DAY);
});

// --- Gate --------------------------------------------------------------------------------------

const iso = (ms: number) => new Date(ms).toISOString();

test("gate: allowed during the trial", () => {
  const s = billingState({ trial_ends_at: iso(NOW.getTime() + DAY), paid_until: null }, NOW);
  assert.deepEqual(s, { blocked: false, lapsedAt: null });
});

test("gate: blocked after the trial when nothing was paid", () => {
  const trialEnd = NOW.getTime() - DAY;
  const s = billingState({ trial_ends_at: iso(trialEnd), paid_until: null }, NOW);
  assert.equal(s.blocked, true);
  assert.equal(s.lapsedAt, iso(trialEnd));
});

test("gate: allowed after the trial while paid_until is in the future", () => {
  const s = billingState({ trial_ends_at: iso(NOW.getTime() - 40 * DAY), paid_until: iso(NOW.getTime() + DAY) }, NOW);
  assert.equal(s.blocked, false);
});

test("gate: 3-day grace after paid_until, then blocked", () => {
  const paidUntil = NOW.getTime() - DAY; // ended a day ago, still inside the grace
  const trial = { trial_ends_at: iso(NOW.getTime() - 60 * DAY), paid_until: iso(paidUntil) };
  assert.equal(billingState(trial, NOW).blocked, false);

  const longAgo = NOW.getTime() - 4 * DAY; // grace is over
  const s = billingState({ trial_ends_at: iso(NOW.getTime() - 60 * DAY), paid_until: iso(longAgo) }, NOW);
  assert.equal(s.blocked, true);
  assert.equal(s.lapsedAt, iso(longAgo + 3 * DAY));
});

test("gate: a missing trial date means billing is not enforced", () => {
  assert.equal(billingState({}, NOW).blocked, false);
});

// --- Database: checkout.paid, idempotency, alerts ----------------------------------------------

function world(overrides: Partial<Tables> = {}) {
  const tables: Tables = {
    stores: [{ id: "s1", paid_until: null, plan_status: "trial", billing_alerted_for: null }],
    payments: [{ id: "p1", store_id: "s1", checkout_id: "ch_1", status: "pending", amount: 1000 }],
    ...overrides,
  };
  return { tables, db: memDb(tables, { payments: ["checkout_id"] }) };
}

test("checkout.paid: marks the payment paid and activates the store with 30 days", async () => {
  const { tables, db } = world();
  const out = await applyCheckoutPaid(db, "ch_1", NOW);
  assert.equal(out.result, "paid");
  assert.equal(tables.payments[0].status, "paid");
  assert.equal(tables.stores[0].plan_status, "active");
  assert.equal(tables.stores[0].paid_until, new Date(NOW.getTime() + 30 * DAY).toISOString());
});

test("checkout.paid: a redelivered event does not extend the period again", async () => {
  const { tables, db } = world();
  await applyCheckoutPaid(db, "ch_1", NOW);
  const after = tables.stores[0].paid_until;
  const again = await applyCheckoutPaid(db, "ch_1", new Date(NOW.getTime() + 5 * DAY));
  assert.equal(again.result, "duplicate");
  assert.equal(tables.stores[0].paid_until, after);
});

test("checkout.paid: an unknown checkout id changes nothing", async () => {
  const { tables, db } = world();
  const out = await applyCheckoutPaid(db, "ch_unknown", NOW);
  assert.equal(out.result, "unknown_checkout");
  assert.equal(tables.stores[0].paid_until, null);
});

test("checkout.paid: a second payment stacks on the first paid period", async () => {
  const { tables, db } = world({
    payments: [
      { id: "p1", store_id: "s1", checkout_id: "ch_1", status: "pending", amount: 1000 },
      { id: "p2", store_id: "s1", checkout_id: "ch_2", status: "pending", amount: 1000 },
    ],
  });
  await applyCheckoutPaid(db, "ch_1", NOW);
  await applyCheckoutPaid(db, "ch_2", NOW);
  assert.equal(tables.stores[0].paid_until, new Date(NOW.getTime() + 60 * DAY).toISOString());
});

test("checkout.failed does not touch a paid payment", async () => {
  const { tables, db } = world();
  await applyCheckoutPaid(db, "ch_1", NOW);
  await applyCheckoutClosed(db, "ch_1", "failed", NOW);
  assert.equal(tables.payments[0].status, "paid");
});

test("alerts: the owner is alerted once per lapse", async () => {
  const { tables, db } = world();
  const lapsed = iso(NOW.getTime() - DAY);
  assert.equal(await claimBillingAlert(db, "s1", lapsed, null), true);
  assert.equal(tables.stores[0].billing_alerted_for, lapsed);
  // Same lapse, from a second concurrent reply that still saw null: the claim is lost.
  assert.equal(await claimBillingAlert(db, "s1", lapsed, null), false);
  assert.equal(await claimBillingAlert(db, "s1", lapsed, lapsed), false);
  // A later lapse (after another payment and expiry) alerts again.
  assert.equal(await claimBillingAlert(db, "s1", iso(NOW.getTime() + 30 * DAY), lapsed), true);
});
