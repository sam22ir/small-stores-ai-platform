// A complete order typed with a typo or an Arabic spelling ("Tbessa", "تبسة") succeeds through the real
// ports and the real create_order tool, and it is priced with the canonical wilaya's fee.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import {
  supabaseCatalog,
  supabaseDeliveryFees,
  supabaseOrders,
} from "../../supabase/functions/_shared/pipeline/ports.ts";
import { executeTool } from "../../supabase/functions/_shared/agent/tools/execute.ts";
import { createFakeDb } from "./fakedb.mjs";
import { buildState } from "./state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "fixture.json"), "utf8"));
const CONV = "11111111-1111-4111-8111-111111111111";
const CUST = "22222222-2222-4222-8222-222222222222";
const UNIQUE_FEE = 98700; // no other wilaya has this fee, so a wrong match cannot pass by accident

function setup() {
  const state = buildState(fixture, "fakedb-wilaya-test");
  const db = createFakeDb(state.tables, { seed: "fakedb-wilaya-test" });
  const fee = state.tables.delivery_fees.find((f) => f.wilaya === "Tébessa");
  assert.ok(fee, "fixture has a Tébessa fee row");
  fee.fee_cents = UNIQUE_FEE;
  const p = state.tables.products.find((x) => x.name === "Basket blanche");
  const variant = state.tables.product_variants.find((v) => v.product_id === p.id && v.label === "41");
  return {
    state,
    variantId: variant.id,
    orders: supabaseOrders(db, false),
    fees: supabaseDeliveryFees(db),
    catalog: supabaseCatalog(db),
    storeId: state.ids.storeId,
  };
}

// The customer has read the total (basket at the database price + the fee for this wilaya) in the last
// assistant message, so create_order's confirmation guard lets the order through.
async function ctxFor(t, wilaya = "Tébessa") {
  const basket = await t.orders.priceBasket(t.storeId, [{ variant_id: t.variantId, quantity: 1 }]);
  const quote = await t.orders.quoteDelivery(t.storeId, wilaya);
  const fee = quote.fee_cents ?? 0;
  return {
    store: { id: t.storeId, currency: "DZD", orders_enabled: true },
    catalog: t.catalog,
    orders: t.orders,
    conversationId: CONV,
    customerId: CUST,
    now: new Date("2026-10-13T10:00:00Z"),
    lastAssistantText: `• Basket blanche taille 41: ${basket / 100} DZD\n• Total: ${(basket + fee) / 100} DZD`,
    customerText: "oui je confirme",
    // The quote the customer got in an earlier turn, as a lookup fact.
    lookups: [`Delivery to ${quote.canonical}: ${fee / 100} DZD`],
  };
}

const order = (t, wilaya) => ({
  customer_name: "Adel Hamidi",
  phone: "0661234567",
  wilaya,
  address: "rue Hassi Bahbah n 5",
  items: [{ variant_id: t.variantId, quantity: 1 }],
});

for (const typed of ["Tbessa", "تبسة", "Tebesaa"]) {
  test(`a complete order typed as "${typed}" is placed at Tébessa's fee`, async () => {
    const t = setup();
    const quote = await t.orders.quoteDelivery(t.storeId, typed);
    assert.equal(quote.served, true);
    assert.equal(quote.canonical, "Tébessa");
    assert.equal(quote.fee_cents, UNIQUE_FEE);

    const r = await executeTool("create_order", order(t, typed), await ctxFor(t, typed));
    assert.equal(r.isError, undefined, r.content);
    assert.match(r.content, /"order_placed":true/);
    const [placed] = t.state.tables.orders;
    assert.equal(placed.wilaya, "Tébessa");
    assert.equal(placed.delivery_fee_cents, UNIQUE_FEE);
  });
}

test("quote_delivery with a typo returns the canonical name and the correction note", async () => {
  const t = setup();
  const r = await executeTool("quote_delivery", { wilaya: "Tbessa", phone: "0661234567" }, await ctxFor(t));
  const body = JSON.parse(r.content);
  assert.equal(body.wilaya, "Tébessa");
  assert.equal(body.corrected_from, "Tbessa");
  assert.equal(r.isError, undefined);
});

test("get_store_info summary from the fixture's own fee rows, with orders off: one 'all other wilayas' line", async () => {
  const t = setup();
  const r = await executeTool(
    "get_store_info",
    {},
    { store: { id: t.storeId, name: "Demo", currency: "DZD", orders_enabled: false }, catalog: t.catalog, fees: t.fees },
  );
  const { delivery_fees: summary } = JSON.parse(r.content);
  const rows = t.state.tables.delivery_fees.filter((f) => f.store_id === t.storeId);
  const distinct = new Set(rows.map((f) => f.fee_cents)).size;
  // One line per distinct fee; the most common fee is the "all other" line (only when all 58 are listed).
  assert.equal(summary.lines.length, distinct, JSON.stringify(summary.lines));
  const last = summary.lines[summary.lines.length - 1];
  assert.match(last, /for all other wilayas$/, JSON.stringify(summary.lines));
  const oran = rows.find((f) => f.wilaya === "Oran");
  assert.ok(oran, "fixture has an Oran fee");
  assert.ok(summary.lines.some((l) => /Oran/.test(l) && /700/.test(l)), JSON.stringify(summary.lines));
});

test("an ambiguous typo is refused by create_order, and nothing is written", async () => {
  const t = setup();
  // "Sila" is one edit from both Msila and Mila; the fixture serves neither under that spelling.
  const r = await executeTool("create_order", order(t, "Sila"), await ctxFor(t, "Sila"));
  assert.equal(r.isError, true);
  assert.equal(t.state.tables.orders.length, 0);
});
