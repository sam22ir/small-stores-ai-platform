// Tests for the fake database's order path (place_order, quote_delivery, search), driven through the
// real ports and the real create_order tool. These pin the production constraints the stress runner relies on.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { supabaseCatalog, supabaseOrders } from "../../supabase/functions/_shared/pipeline/ports.ts";
import { executeTool } from "../../supabase/functions/_shared/agent/tools/execute.ts";
import { createFakeDb } from "./fakedb.mjs";
import { buildState } from "./state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "fixture.json"), "utf8"));
const CONV = "11111111-1111-4111-8111-111111111111";
const CUST = "22222222-2222-4222-8222-222222222222";

function setup() {
  const state = buildState(fixture, "fakedb-test");
  const db = createFakeDb(state.tables, { seed: "fakedb-test" });
  const variant = (product, label) => {
    const p = state.tables.products.find((x) => x.name === product);
    return state.tables.product_variants.find((v) => v.product_id === p.id && v.label === label);
  };
  const stock = (product, label) => variant(product, label).stock_quantity;
  return {
    state,
    db,
    variant,
    stock,
    orders: supabaseOrders(db, false),
    catalog: supabaseCatalog(db),
    storeId: state.ids.storeId,
  };
}

function order(t, overrides = {}) {
  return {
    storeId: t.storeId,
    conversationId: CONV,
    customerId: CUST,
    customerName: "Ahmed Benali",
    phone: "0550123456",
    wilaya: "Alger",
    address: "cite 1 rue 5",
    items: [{ variant_id: t.variant("Basket blanche", "41").id, quantity: 1 }],
    key: `k-${Math.random()}`,
    ...overrides,
  };
}

test("phone must match ^0[567][0-9]{8}$ at the database: bad numbers are rejected, no stock moves", async () => {
  const t = setup();
  for (const phone of ["0123456789", "055012345", "05501234567", "+213550123456", "0550 12 34 56"]) {
    const r = await t.orders.placeOrder(order(t, { phone }));
    assert.equal(r.ok, false, phone);
    assert.equal(r.code, "invalid", phone);
  }
  assert.equal(t.stock("Basket blanche", "41"), 6);
  assert.equal(t.state.tables.orders.length, 0);

  const ok = await t.orders.placeOrder(order(t, { phone: "0770123456" }));
  assert.equal(ok.ok, true);
});

test("name and address CHECKs at the database (1-120 and 1-300 characters after trim) move no stock", async () => {
  const t = setup();
  const longName = await t.orders.placeOrder(order(t, { customerName: "A".repeat(121) }));
  assert.equal(longName.ok, false);
  assert.equal(longName.code, "invalid");
  const blankAddress = await t.orders.placeOrder(order(t, { address: "   " }));
  assert.equal(blankAddress.ok, false);
  assert.equal(blankAddress.code, "invalid");
  assert.equal(t.stock("Basket blanche", "41"), 6);
});

test("unknown wilaya is rejected as wilaya_not_served, the store's spelling is required", async () => {
  const t = setup();
  const r = await t.orders.placeOrder(order(t, { wilaya: "Narnia" }));
  assert.deepEqual(r, { ok: false, code: "wilaya_not_served" });
  // The production matcher maps a casual spelling to the store's name before the RPC.
  const alger = await t.orders.placeOrder(order(t, { wilaya: "alger" }));
  assert.equal(alger.ok, true);
  assert.equal(t.state.tables.orders[0].wilaya, "Alger");
});

test("quote_delivery: store fee for a served wilaya, not served for an unknown one", async () => {
  const t = setup();
  assert.deepEqual(await t.orders.quoteDelivery(t.storeId, "Constantine"), {
    served: true,
    fee_cents: 70000,
    canonical: "Constantine",
  });
  const miss = await t.orders.quoteDelivery(t.storeId, "Narnia");
  assert.equal(miss.served, false);
  assert.ok(miss.options.includes("Alger"));
});

test("sold-out variant (stock 0) is refused with insufficient_stock and names the item", async () => {
  const t = setup();
  const r = await t.orders.placeOrder(order(t, {
    items: [{ variant_id: t.variant("Basket blanche", "43").id, quantity: 1 }],
  }));
  assert.deepEqual(r, { ok: false, code: "insufficient_stock", detail: "Basket blanche 43" });
  assert.equal(t.state.tables.orders.length, 0);
});

test("stock is decremented on success and a failing line rolls back the lines before it", async () => {
  const t = setup();
  // 41 has 6 in stock, 42 has 1: the second line fails, so 41 must stay at 6.
  const bad = await t.orders.placeOrder(order(t, {
    items: [
      { variant_id: t.variant("Basket blanche", "41").id, quantity: 2 },
      { variant_id: t.variant("Basket blanche", "42").id, quantity: 2 },
    ],
  }));
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "insufficient_stock");
  assert.equal(t.stock("Basket blanche", "41"), 6);

  const good = await t.orders.placeOrder(order(t, {
    items: [{ variant_id: t.variant("Basket blanche", "41").id, quantity: 2 }],
  }));
  assert.equal(good.ok, true);
  assert.equal(t.stock("Basket blanche", "41"), 4);
  // The catalog reads the same stock the order just used.
  const [p] = await t.catalog.searchProducts(t.storeId, "sneakers", 5);
  assert.equal(p.variants.find((v) => v.label === "41").stock_quantity, 4);
});

test("totals are subtotal (variant or product price x quantity) plus the wilaya fee", async () => {
  const t = setup();
  const r = await t.orders.placeOrder(order(t, {
    items: [{ variant_id: t.variant("Basket blanche", "41").id, quantity: 2 }],
    wilaya: "Alger",
  }));
  assert.equal(r.ok, true);
  assert.equal(r.subtotal_cents, 1_300_000); // 2 x 6500 DZD
  assert.equal(r.delivery_fee_cents, 40_000); // Alger 400 DZD
  assert.equal(r.total_cents, 1_340_000);
});

test("quantity must be 1 to 50 at the database; 0 and 51 are refused", async () => {
  const t = setup();
  for (const quantity of [0, 51, 1.5]) {
    const r = await t.orders.placeOrder(order(t, {
      items: [{ variant_id: t.variant("Casquette noire", "Unique").id, quantity }],
    }));
    assert.equal(r.ok, false, String(quantity));
    assert.equal(r.code, "invalid", String(quantity));
  }
  assert.equal(t.stock("Casquette noire", "Unique"), 10);
});

test("a variant that does not exist or is not a UUID is refused, a non-UUID as invalid", async () => {
  const t = setup();
  const unknown = await t.orders.placeOrder(order(t, {
    items: [{ variant_id: "99999999-9999-4999-8999-999999999999", quantity: 1 }],
  }));
  assert.deepEqual(unknown, { ok: false, code: "unknown_variant" });
  const notUuid = await t.orders.placeOrder(order(t, {
    items: [{ variant_id: "basket-41", quantity: 1 }],
  }));
  assert.equal(notUuid.ok, false);
  assert.equal(notUuid.code, "invalid");
});

test("the same idempotency key returns the first order as a duplicate and moves no stock", async () => {
  const t = setup();
  const input = order(t, { key: "same-key" });
  const first = await t.orders.placeOrder(input);
  const again = await t.orders.placeOrder(input);
  assert.equal(first.ok && first.duplicate, false);
  assert.equal(again.ok && again.duplicate, true);
  assert.equal(t.state.tables.orders.length, 1);
  assert.equal(t.stock("Basket blanche", "41"), 5);
});

test("create_order tool: invalid Algerian phone is refused before the database, and a valid order goes through", async () => {
  const t = setup();
  const ctx = {
    store: { id: t.storeId, currency: "DZD", orders_enabled: true },
    catalog: t.catalog,
    orders: t.orders,
    conversationId: CONV,
    customerId: CUST,
    now: new Date("2026-10-13T10:00:00Z"),
  };
  const items = [{ product_name: "Basket blanche", variant_label: "41", quantity: 1 }];
  const bad = await executeTool("create_order", {
    customer_name: "Ahmed Benali",
    phone: "0123",
    wilaya: "Alger",
    address: "cite 1 rue 5",
    items,
  }, ctx);
  assert.equal(bad.isError, true);
  assert.match(bad.content, /not a valid Algerian mobile/);
  assert.equal(t.state.tables.orders.length, 0);

  const ok = await executeTool("create_order", {
    customer_name: "Ahmed Benali",
    phone: "+213 550 12 34 56",
    wilaya: "Alger",
    address: "cite 1 rue 5",
    items,
  }, ctx);
  assert.equal(ok.isError, undefined);
  assert.match(ok.content, /"order_placed":true/);
  assert.equal(t.state.tables.orders[0].phone, "0550123456");
  assert.equal(t.stock("Basket blanche", "41"), 5);
});
