import assert from "node:assert/strict";
import { test } from "node:test";
import { billingView } from "./billing.ts";

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-10-10T12:00:00.000Z");
const at = (ms: number) => new Date(ms).toISOString();

test("trial: shows days left until the trial ends", () => {
  const v = billingView({ trial_ends_at: at(NOW.getTime() + 3 * DAY), paid_until: null }, NOW);
  assert.equal(v.status, "trial");
  assert.equal(v.daysLeft, 3);
  assert.equal(v.endsAt, at(NOW.getTime() + 3 * DAY));
});

test("active: paid period shows its end date", () => {
  const paid = NOW.getTime() + 20 * DAY;
  const v = billingView({ trial_ends_at: at(NOW.getTime() - 40 * DAY), paid_until: at(paid) }, NOW);
  assert.equal(v.status, "active");
  assert.equal(v.endsAt, at(paid));
  assert.equal(v.daysLeft, 20);
});

test("grace: paid period ended within 3 days", () => {
  const v = billingView({ trial_ends_at: at(NOW.getTime() - 60 * DAY), paid_until: at(NOW.getTime() - DAY) }, NOW);
  assert.equal(v.status, "grace");
  assert.equal(v.daysLeft, 0);
});

test("expired: trial over and nothing paid", () => {
  const trial = NOW.getTime() - 2 * DAY;
  const v = billingView({ trial_ends_at: at(trial), paid_until: null }, NOW);
  assert.equal(v.status, "expired");
  assert.equal(v.endsAt, at(trial));
});

test("expired: paid period ended more than 3 days ago", () => {
  const v = billingView({ trial_ends_at: at(NOW.getTime() - 60 * DAY), paid_until: at(NOW.getTime() - 4 * DAY) }, NOW);
  assert.equal(v.status, "expired");
});
