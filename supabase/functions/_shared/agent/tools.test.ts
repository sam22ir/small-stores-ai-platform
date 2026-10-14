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

test("get_store_info includes the owner's saved FAQ answers, newest first and size-capped", async () => {
  const faq = {
    list: () =>
      Promise.resolve([
        { question: "Do you gift wrap?", answer: "Yes, free of charge." },
        { question: "Q".repeat(500), answer: "A".repeat(2000) },
      ]),
  };
  const r = await executeTool("get_store_info", {}, { ...ctx(false), faq });
  const body = JSON.parse(r.content);
  assert.equal(body.owner_faq[0].answer, "Yes, free of charge.");
  assert.equal(body.owner_faq[1].question.length, 200);
  assert.equal(body.owner_faq[1].answer.length, 600);
  const none = JSON.parse((await executeTool("get_store_info", {}, ctx(false))).content);
  assert.equal(none.owner_faq, undefined);
});

test("a product marked sold out until later is reported out of stock, then back in stock", async () => {
  const soldOut: Catalog = {
    ...catalog,
    searchProducts: async (...args) => {
      const [first] = await catalog.searchProducts(...args);
      return [{ ...first, sold_out_until: "2026-10-04T23:00:00Z" }];
    },
  };
  const during = { ...ctx(false), catalog: soldOut, now: new Date("2026-10-04T10:00:00Z") };
  const view = JSON.parse((await executeTool("search_products", { query: "hoodie" }, during)).content);
  assert.equal(view.results[0].availability, "out of stock");
  assert.equal(view.results[0].variants[0].availability, "out of stock");
  assert.equal(view.results[0].variants[0].units_left, undefined);

  const after = { ...during, now: new Date("2026-10-05T10:00:00Z") };
  const back = JSON.parse((await executeTool("search_products", { query: "hoodie" }, after)).content);
  assert.equal(back.results[0].availability, "in stock");
});

// A catalog with several products, for the variant-resolution tests.
const XL = "44444444-4444-4444-8444-444444444444";
const SHOP: Catalog = {
  searchProducts: () =>
    Promise.resolve([
      {
        id: "33333333-3333-4333-8333-333333333333",
        name: "Black Hoodie",
        description: null,
        price_cents: 4500,
        aliases: "hoodie noir, hoodie black",
        variants: [
          { id: VARIANT, label: "M", price_cents: null, stock_quantity: 3 },
          { id: XL, label: "XL", price_cents: null, stock_quantity: 4 },
        ],
      },
    ]),
  getProduct: () => Promise.resolve(null),
};

function shopCtx(catalog: Catalog, calls: PlaceOrderInput[] = []) {
  return { ...ctx(true, fakeOrders(OK, calls)), catalog };
}

test("an invented variant_id is recovered from product_name and variant_label", async () => {
  const calls: PlaceOrderInput[] = [];
  const r = await executeTool(
    "create_order",
    { ...goodOrder, items: [{ variant_id: "hoodie-noir-xl", quantity: 1, product_name: "Black Hoodie", variant_label: "XL" }] },
    shopCtx(SHOP, calls),
  );
  assert.ok(!r.isError, r.content);
  assert.deepEqual(calls[0].items, [{ variant_id: XL, quantity: 1 }]);
});

test("product aliases and label case or spacing resolve too", async () => {
  const calls: PlaceOrderInput[] = [];
  const r = await executeTool(
    "create_order",
    { ...goodOrder, items: [{ variant_id: "hoodie-black-m", quantity: 2, product_name: " hoodie NOIR ", variant_label: "m" }] },
    shopCtx(SHOP, calls),
  );
  assert.ok(!r.isError, r.content);
  assert.deepEqual(calls[0].items, [{ variant_id: VARIANT, quantity: 2 }]);
});

test("an invented id with an unknown product or label asks the model to search again", async () => {
  const calls: PlaceOrderInput[] = [];
  const c = shopCtx(SHOP, calls);
  for (const item of [
    { variant_id: "x", quantity: 1, product_name: "Red Shirt", variant_label: "M" },
    { variant_id: "x", quantity: 1, product_name: "Black Hoodie", variant_label: "XXL" },
  ]) {
    const r = await executeTool("create_order", { ...goodOrder, items: [item] }, c);
    assert.equal(r.isError, true);
    assert.match(r.content, /search_products/);
  }
  assert.equal(calls.length, 0);
});

test("an ambiguous product or variant is not guessed", async () => {
  const twin = { ...SHOP, searchProducts: async (...args: Parameters<Catalog["searchProducts"]>) => [
    ...(await SHOP.searchProducts(...args)),
    { ...(await SHOP.searchProducts(...args))[0], id: "55555555-5555-4555-8555-555555555555" },
  ] } as Catalog;
  const calls: PlaceOrderInput[] = [];
  const byTwins = await executeTool(
    "create_order",
    { ...goodOrder, items: [{ variant_id: "x", quantity: 1, product_name: "Black Hoodie", variant_label: "M" }] },
    shopCtx(twin, calls),
  );
  assert.equal(byTwins.isError, true);
  assert.match(byTwins.content, /more than one/);

  const noLabel = await executeTool(
    "create_order",
    { ...goodOrder, items: [{ variant_id: "x", quantity: 1, product_name: "Black Hoodie" }] },
    shopCtx(SHOP, calls),
  );
  assert.equal(noLabel.isError, true);
  assert.match(noLabel.content, /more than one/);
  assert.equal(calls.length, 0);
});

test("an invented id without product_name gets the search guidance", async () => {
  const calls: PlaceOrderInput[] = [];
  const r = await executeTool(
    "create_order",
    { ...goodOrder, items: [{ variant_id: "hoodie-noir-xl", quantity: 1 }] },
    shopCtx(SHOP, calls),
  );
  assert.equal(r.isError, true);
  assert.match(r.content, /search_products/);
  assert.equal(calls.length, 0);
});

test("a sold-out product is not used to recover an order", async () => {
  const soldOut = { ...SHOP, searchProducts: async (...args: Parameters<Catalog["searchProducts"]>) => [
    { ...(await SHOP.searchProducts(...args))[0], sold_out_until: "2026-10-05T10:00:00Z" },
  ] } as Catalog;
  const calls: PlaceOrderInput[] = [];
  const r = await executeTool(
    "create_order",
    { ...goodOrder, items: [{ variant_id: "x", quantity: 1, product_name: "Black Hoodie", variant_label: "M" }] },
    shopCtx(soldOut, calls),
  );
  assert.equal(r.isError, true);
  assert.equal(calls.length, 0);
});

test("a real variant UUID still works when product_name is also given", async () => {
  const calls: PlaceOrderInput[] = [];
  const r = await executeTool(
    "create_order",
    { ...goodOrder, items: [{ variant_id: VARIANT, quantity: 1, product_name: "Black Hoodie", variant_label: "XL" }] },
    shopCtx(SHOP, calls),
  );
  assert.ok(!r.isError, r.content);
  assert.deepEqual(calls[0].items, [{ variant_id: VARIANT, quantity: 1 }]);
});

test("handoff_to_owner carries the owner summary, trimmed and capped at 400 characters", async () => {
  const r = await executeTool(
    "handoff_to_owner",
    { reason: "wants 2 hoodies", summary: `  ${"a".repeat(500)}  ` },
    ctx(false),
  );
  assert.equal(r.handoffReason, "wants 2 hoodies");
  assert.equal(r.handoffSummary, "a".repeat(400));
});

test("handoff_to_owner without a usable summary stores null", async () => {
  const blank = await executeTool("handoff_to_owner", { reason: "complaint", summary: "   " }, ctx(false));
  const missing = await executeTool("handoff_to_owner", { reason: "complaint" }, ctx(false));
  assert.equal(blank.handoffSummary, null);
  assert.equal(missing.handoffSummary, null);
});

test("handoff_to_owner schema requires reason and summary and allows no other fields", () => {
  const tool = toolsForStore(store(false)).find((t) => t.name === "handoff_to_owner");
  assert.ok(tool);
  const schema = tool.input_schema as unknown as {
    properties: Record<string, { type: string }>;
    required: string[];
    additionalProperties: boolean;
  };
  assert.deepEqual(schema.required, ["reason", "summary"]);
  assert.equal(schema.properties.summary.type, "string");
  assert.equal(schema.additionalProperties, false);
});
