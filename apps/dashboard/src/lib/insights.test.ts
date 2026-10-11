import assert from "node:assert/strict";
import { test } from "node:test";
import { barHeights, EMPTY_TOTALS, handoffRate, isEmptyInsights, parseInsights } from "./insights.ts";

const day = (d: string, conversations: number, orders = 0) => ({
  day: d, conversations, replies: 0, handoffs: 0, orders, revenue_cents: 0,
});

test("handoff rate is handoffs over conversations", () => {
  assert.equal(handoffRate({ conversations: 4, handoffs: 1 }), 0.25);
});

test("handoff rate is 0 with no conversations, even if handoffs exist", () => {
  assert.equal(handoffRate({ conversations: 0, handoffs: 0 }), 0);
  assert.equal(handoffRate({ conversations: 0, handoffs: 3 }), 0);
});

test("handoff rate is clamped to 0..1 when handoffs are counted on other dates", () => {
  assert.equal(handoffRate({ conversations: 2, handoffs: 5 }), 1);
  assert.equal(handoffRate({ conversations: 2, handoffs: -1 }), 0);
});

test("empty data: no days, zero totals, empty state", () => {
  const r = parseInsights({});
  assert.deepEqual(r.days, []);
  assert.deepEqual(r.totals, EMPTY_TOTALS);
  assert.deepEqual(r.top_products, []);
  assert.equal(r.reply_credits, 0);
  assert.equal(isEmptyInsights(r.totals), true);
  assert.equal(isEmptyInsights(parseInsights(null).totals), true);
});

test("parses a full RPC payload and ignores bad fields", () => {
  const r = parseInsights({
    days: [{ day: "2026-10-10", conversations: 2, replies: 3, handoffs: 1, orders: 1, revenue_cents: 4500 }, null, { day: 7, conversations: "x" }],
    totals: { conversations: 2, replies: 3, handoffs: 1, orders: 1, revenue_cents: 4500 },
    top_products: [{ name: "Hoodie", quantity: 2 }, { quantity: 1 }],
    reply_credits: 120,
  });
  assert.equal(r.days.length, 3);
  assert.equal(r.days[0].replies, 3);
  assert.equal(r.days[1].day, "");
  assert.equal(r.days[2].day, "");
  assert.equal(r.days[2].conversations, 0);
  assert.deepEqual(r.top_products, [{ name: "Hoodie", quantity: 2 }, { name: "", quantity: 1 }]);
  assert.equal(r.reply_credits, 120);
  assert.equal(isEmptyInsights(r.totals), false);
});

test("bar heights normalize to the busiest day", () => {
  const series = [day("a", 1), day("b", 4), day("c", 2)];
  assert.deepEqual(barHeights(series, "conversations"), [0.25, 1, 0.5]);
});

test("bar heights are all zero when nothing happened, and for an empty series", () => {
  assert.deepEqual(barHeights([day("a", 0), day("b", 0)], "conversations"), [0, 0]);
  assert.deepEqual(barHeights([], "orders"), []);
});

test("bar heights use the requested key", () => {
  const series = [day("a", 5, 0), day("b", 1, 2)];
  assert.deepEqual(barHeights(series, "orders"), [0, 1]);
});
