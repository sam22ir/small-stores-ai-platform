import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "./prompt.ts";
import { executeTool, toolsForStore } from "./tools.ts";
import type {
  Catalog,
  OrderPort,
  PlaceOrderInput,
  PlaceOrderResult,
  StoreContext,
} from "./types.ts";

const VARIANT = "11111111-1111-4111-8111-111111111111";
const catalog: Catalog = {
  searchProducts: () =>
    Promise.resolve([{
      id: "22222222-2222-4222-8222-222222222222",
      name: "Black Hoodie",
      description: null,
      price_cents: 4500,
      variants: [{ id: VARIANT, label: "M", price_cents: null, stock_quantity: 3 }],
    }]),
  getProduct: () => Promise.resolve(null),
};

function store(orders_enabled: boolean): StoreContext {
  return { id: "s1", name: "Shop", currency: "DZD", business_info: null, orders_enabled };
}

function fakeOrders(result: PlaceOrderResult, calls: PlaceOrderInput[] = []): OrderPort {
  return {
    quoteDelivery: (_s, wilaya) =>
      Promise.resolve(
        wilaya.toLowerCase() === "oran"
          ? { served: true, fee_cents: 60000, canonical: "Oran" }
          : wilaya.toLowerCase() === "tamanrasset"
          ? { served: false, fee_cents: null, options: ["Alger", "Oran"] }
          : { served: true, fee_cents: null },
      ),
    placeOrder: (input) => {
      calls.push(input);
      return Promise.resolve(result);
    },
  };
}

const OK: PlaceOrderResult = {
  ok: true,
  order_id: "o1",
  subtotal_cents: 9000,
  delivery_fee_cents: 60000,
  total_cents: 69000,
  duplicate: false,
};

const goodOrder = {
  customer_name: "Amine B",
  phone: "+213 555 12 34 56",
  wilaya: "Oran",
  address: "12 rue des Frères, Es Senia",
  items: [{ variant_id: VARIANT, quantity: 2 }],
};

function ctx(orders_enabled: boolean, orders?: OrderPort) {
  return {
    store: store(orders_enabled),
    catalog,
    orders,
    conversationId: "c1",
    customerId: "u1",
    now: new Date("2026-10-04T10:00:00Z"),
  };
}

test("order tools exist only when the owner enabled ordering", () => {
  const off = toolsForStore(store(false)).map((t) => t.name);
  const on = toolsForStore(store(true)).map((t) => t.name);
  assert.ok(!off.includes("create_order") && !off.includes("quote_delivery"));
  assert.ok(on.includes("create_order") && on.includes("quote_delivery"));
});

test("prompt switches between handoff-for-orders and order flow", () => {
  assert.match(buildSystemPrompt(store(false)), /can't take orders/);
  assert.match(buildSystemPrompt(store(true)), /create_order/);
  assert.doesNotMatch(buildSystemPrompt(store(true)), /can't take orders/);
});

test("variant ids are shown to the model only when ordering is on", async () => {
  const off = await executeTool("search_products", { query: "hoodie" }, ctx(false));
  const on = await executeTool("search_products", { query: "hoodie" }, ctx(true, fakeOrders(OK)));
  assert.ok(!off.content.includes(VARIANT));
  assert.ok(on.content.includes(VARIANT));
});

test("create_order is refused when ordering is off", async () => {
  const calls: PlaceOrderInput[] = [];
  const r = await executeTool("create_order", goodOrder, ctx(false, fakeOrders(OK, calls)));
  assert.equal(r.isError, true);
  assert.equal(calls.length, 0);
});

test("create_order places a normalized order and reports totals", async () => {
  const calls: PlaceOrderInput[] = [];
  const r = await executeTool("create_order", goodOrder, ctx(true, fakeOrders(OK, calls)));
  assert.ok(!r.isError);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].phone, "0555123456");
  assert.equal(calls[0].storeId, "s1");
  assert.deepEqual(calls[0].items, [{ variant_id: VARIANT, quantity: 2 }]);
  assert.match(calls[0].key, /^c1:2026-10-04:/);
  const body = JSON.parse(r.content);
  assert.equal(body.order_placed, true);
  assert.match(body.total_to_pay_on_delivery, /690/);
});

test("create_order rejects bad input without touching the database", async () => {
  const calls: PlaceOrderInput[] = [];
  const c = ctx(true, fakeOrders(OK, calls));
  const bad = [
    { ...goodOrder, phone: "123" },
    { ...goodOrder, customer_name: " " },
    { ...goodOrder, address: "x" },
    { ...goodOrder, wilaya: "" },
    { ...goodOrder, items: [] },
    { ...goodOrder, items: [{ variant_id: "nope", quantity: 1 }] },
    { ...goodOrder, items: [{ variant_id: VARIANT, quantity: 0 }] },
    { ...goodOrder, items: [{ variant_id: VARIANT, quantity: 11 }] },
    { ...goodOrder, items: [{ variant_id: VARIANT, quantity: 1.5 }] },
    { ...goodOrder, items: [{ variant_id: VARIANT, quantity: 6 }, { variant_id: VARIANT, quantity: 6 }] },
  ];
  for (const input of bad) {
    const r = await executeTool("create_order", input, c);
    assert.equal(r.isError, true, JSON.stringify(input));
  }
  assert.equal(calls.length, 0);
});

test("create_order maps database refusals to instructions for the model", async () => {
  const stock = await executeTool(
    "create_order",
    goodOrder,
    ctx(true, fakeOrders({ ok: false, code: "insufficient_stock", detail: "Black Hoodie M" })),
  );
  assert.equal(stock.isError, true);
  assert.match(stock.content, /Black Hoodie M/);
  const wilaya = await executeTool(
    "create_order",
    goodOrder,
    ctx(true, fakeOrders({ ok: false, code: "wilaya_not_served" })),
  );
  assert.match(wilaya.content, /deliver/);
});

test("a duplicate order is reported, not created twice", async () => {
  const r = await executeTool(
    "create_order",
    goodOrder,
    ctx(true, fakeOrders({ ...OK, duplicate: true })),
  );
  assert.equal(JSON.parse(r.content).already_placed_earlier, true);
});

test("quote_delivery handles fee, unset fee and unserved wilaya", async () => {
  const c = ctx(true, fakeOrders(OK));
  const oran = JSON.parse((await executeTool("quote_delivery", { wilaya: "Oran" }, c)).content);
  assert.match(oran.delivery_fee, /600/);
  const unset = JSON.parse((await executeTool("quote_delivery", { wilaya: "Alger" }, c)).content);
  assert.equal(unset.delivery_fee, "not set");
  const far = JSON.parse((await executeTool("quote_delivery", { wilaya: "Tamanrasset" }, c)).content);
  assert.equal(far.delivers, false);
  assert.deepEqual(far.wilayas_served, ["Alger", "Oran"]);
  assert.equal(oran.wilaya, "Oran");
  const off = await executeTool("quote_delivery", { wilaya: "Oran" }, ctx(false));
  assert.equal(off.isError, true);
});
