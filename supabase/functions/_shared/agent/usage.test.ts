import assert from "node:assert/strict";
import { test } from "node:test";
import { monthStartUtc, usageStatus } from "./usage.ts";

test("month starts on the 1st at 00:00 UTC", () => {
  assert.equal(monthStartUtc(new Date("2026-10-04T23:59:00Z")).toISOString(), "2026-10-01T00:00:00.000Z");
  assert.equal(monthStartUtc(new Date("2026-12-31T23:59:59Z")).toISOString(), "2026-12-01T00:00:00.000Z");
  assert.equal(monthStartUtc(new Date("2027-01-01T00:00:00Z")).toISOString(), "2027-01-01T00:00:00.000Z");
});

test("usage status flags the warning and the limit", () => {
  assert.deepEqual(usageStatus(10, 100), { used: 10, limit: 100, remaining: 90, exceeded: false, nearLimit: false });
  assert.equal(usageStatus(80, 100).nearLimit, true);
  assert.equal(usageStatus(99, 100).exceeded, false);
  assert.equal(usageStatus(100, 100).exceeded, true);
  assert.equal(usageStatus(150, 100).remaining, 0);
  assert.equal(usageStatus(0, 0).exceeded, true); // a zero limit means no replies
});
