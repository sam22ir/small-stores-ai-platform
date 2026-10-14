import assert from "node:assert/strict";
import { test } from "node:test";
import type Anthropic from "@anthropic-ai/sdk";
import { runAgent } from "./run.ts";
import { amountShown, amountsIn, assistantBeforeCurrentTurn, NOT_CONFIRMED_PREFIX } from "./tools/order-guard.ts";
import { capLookupOutputs } from "./tools/lookup-output.ts";
import type { Catalog, OrderPort, PlaceOrderInput, ProductRecord, StoreContext } from "./types.ts";

// 7700 DZD in cents, the total of the stress case OR-003 (2 hoodies, Constantine).
const TOTAL = 770000;

test("amounts are read the same way whatever formatting the model used", () => {
  const forms = [
    "Total: 7700 DA",
    "Total: 7700 DZD.",
    "Total : 7 700 DZD",
    "Total: 7 700 DA",
    "Total: 7.700 DA",
    "Total: 7,700 DZD",
    "Total: DZD 7,700.00",
    "Total: 7,700.00 DZD",
    "Total: 7700,00 DA",
    "Total: 7 700,00 DA",
    "Total : 7 700 DA",
    "Total: 7 700 DA",
    "المجموع 7700 دج",
    "المجموع ٧٧٠٠ دج",
    "المجموع ٧٬٧٠٠ دج",
    "المجموع ٧ ٧٠٠ دج",
    "المجموع 7 700 دج",
  ];
  for (const f of forms) assert.ok(amountShown(f, TOTAL), f);
});

test("amounts written with a decimal part compare as numbers", () => {
  assert.ok(amountShown("Total: 4 700,00 DA", 470000)); // OR-049 style, Arabic-free
  assert.ok(amountShown("Total: 4,700.00 DZD", 470000));
  assert.ok(amountShown("Total: 770.50 DA", 77050));
  assert.deepEqual(amountsIn("٤٬٧٠٠,٠٠ دج"), [4700]);
});

test("a different number, or a part of the total, does not count as the total", () => {
  assert.equal(amountShown("Total: 770 DA", TOTAL), false);
  assert.equal(amountShown("Basket 6500 DZD, delivery 1200 DZD", TOTAL), false);
  // Two lines that add up to the total are not the total as one number.
  assert.equal(amountShown("• Hoodie × 2: 7000 DA\n• Livraison: 700 DA", TOTAL), false);
  assert.equal(amountShown("", TOTAL), false);
});

test("the total is found in a summary line, not only in a stand-alone line", () => {
  const summary = "• Hoodie noir taille M × 2 : 7000 DA\n• Livraison à Constantine : 700 DA\n• Total à payer à la livraison : 7700 DA\n\nTconfirme la commande ?";
  assert.ok(amountShown(summary, TOTAL));
});

test("a delivery quote stays in the saved lookups even when searches fill the run's budget", () => {
  const big = "x".repeat(900);
  const calls = [
    { name: "search_products", input: {}, is_error: false, output: big },
    { name: "search_products", input: {}, is_error: false, output: big },
    { name: "quote_delivery", input: {}, is_error: false, output: "Delivery to Oran: 600 DZD" },
  ];
  const kept = capLookupOutputs(calls);
  assert.equal(kept[2].output, "Delivery to Oran: 600 DZD");
  assert.equal(kept[0].output, big);
  assert.equal(kept[1].output, undefined);
});

test("the assistant text before the customer's current message", () => {
  const summary = { role: "assistant", text: "• Total: 7700 DA. Confirm?" };
  // A plain confirmation after the summary.
  assert.equal(
    assistantBeforeCurrentTurn([{ role: "user", text: "details" }, summary, { role: "user", text: "yes" }]),
    summary.text,
  );
  // Consecutive customer messages are one turn; the summary is still the last assistant text before them.
  assert.equal(
    assistantBeforeCurrentTurn([summary, { role: "user", text: "yes" }, { role: "user", text: "ok" }]),
    summary.text,
  );
  // A photo note between the summary and the confirmation does not hide the summary.
  assert.equal(
    assistantBeforeCurrentTurn([
      summary,
      { role: "assistant", text: "[sent a photo of Black hoodie]" },
      { role: "user", text: "yes" },
    ]),
    `${summary.text}\n[sent a photo of Black hoodie]`,
  );
  // The server's retry pair (the first reply and a correction note) does not move the anchor.
  assert.equal(
    assistantBeforeCurrentTurn([
      summary,
      { role: "user", text: "yes" },
      { role: "assistant", text: "first reply" },
      { role: "user", text: "[Wakil correction] Rewrite the reply." },
    ]),
    summary.text,
  );
  assert.equal(assistantBeforeCurrentTurn([{ role: "user", text: "salam" }]), "");
});

// ---- Runs through runAgent with a scripted model ----

const VARIANT = "11111111-1111-4111-8111-111111111111";
const PRODUCT: ProductRecord = {
  id: "22222222-2222-4222-8222-222222222222",
  name: "Black Hoodie",
  description: null,
  price_cents: 350000, // 3500 DZD
  variants: [{ id: VARIANT, label: "M", price_cents: null, stock_quantity: 5 }],
};
const catalog: Catalog = {
  searchProducts: () => Promise.resolve([PRODUCT]),
  getProduct: () => Promise.resolve(PRODUCT),
};
const STORE: StoreContext = { id: "s1", name: "Shop", currency: "DZD", business_info: null, orders_enabled: true };

function orders(calls: PlaceOrderInput[]): OrderPort {
  return {
    quoteDelivery: () => Promise.resolve({ served: true, fee_cents: 70000, canonical: "Constantine" }),
    priceBasket: (_s, items) => Promise.resolve(items.reduce((sum, i) => sum + 350000 * i.quantity, 0)),
    placeOrder: (input) => {
      calls.push(input);
      return Promise.resolve({
        ok: true,
        order_id: "o1",
        subtotal_cents: 700000,
        delivery_fee_cents: 70000,
        total_cents: 770000,
        duplicate: false,
      });
    },
  };
}

type Block = Record<string, unknown>;
// Replays scripted model responses, one per request. Each `content` is one response.
function scripted(responses: Block[][]) {
  const requests: { messages: { role: string; content: unknown }[] }[] = [];
  let i = 0;
  const client = {
    beta: {
      messages: {
        create(params: { messages: { role: string; content: unknown }[] }) {
          requests.push(structuredClone(params));
          const content = responses[i++] ?? [{ type: "text", text: "" }];
          const hasTool = content.some((b) => b.type === "tool_use");
          return Promise.resolve({
            content,
            stop_reason: hasTool ? "tool_use" : "end_turn",
            usage: { input_tokens: 1, output_tokens: 1 },
          });
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const use = (id: string, name: string, input: unknown): Block => ({ type: "tool_use", id, name, input });
const say = (t: string): Block => ({ type: "text", text: t });

// Ordering needs a conversation and a customer, as in the pipeline.
// lookups: the delivery quote the customer got in an earlier turn (saved as a lookup fact).
const IDS = { conversationId: "c1", customerId: "u1", lookups: ["Delivery to Constantine: 700 DZD"] };

const details = {
  customer_name: "Sofiane Amrani",
  phone: "0770123456",
  wilaya: "Constantine",
  address: "Targa Ouzemour 9, Constantine",
  items: [{ variant_id: VARIANT, quantity: 2 }],
};
const quoteInput = { wilaya: "Constantine", phone: "0770123456" };

test("OR-019 style: details and 'order received' in one turn, quote and create in the same run: no order, no handoff", async () => {
  const placed: PlaceOrderInput[] = [];
  const { client } = scripted([
    [use("q1", "quote_delivery", quoteInput)],
    [use("c1", "create_order", details)],
    [use("c2", "create_order", details)],
    [say("Summary: • Total: 7700 DA. Confirm?")],
  ]);
  const history = [{ role: "user" as const, text: "Name Sofiane Amrani, 0770123456, Constantine, Targa Ouzemour 9. Order received." }];
  const r = await runAgent({ client, catalog, store: STORE, history, orders: orders(placed), ...IDS });
  assert.equal(placed.length, 0);
  assert.equal(r.handoffReason, null);
  assert.ok(!r.toolCalls.some((t) => t.name === "handoff_to_owner"));
  const creates = r.toolCalls.filter((t) => t.name === "create_order");
  assert.equal(creates.length, 2);
  for (const c of creates) {
    assert.equal(c.is_error, true);
    assert.ok(c.error?.startsWith(NOT_CONFIRMED_PREFIX), c.error);
  }
});

test("a store with no delivery fee: a unit price in an earlier message is not the total, and a same-run quote is refused", async () => {
  const placed: PlaceOrderInput[] = [];
  const noFee: OrderPort = { ...orders(placed), quoteDelivery: () => Promise.resolve({ served: true, fee_cents: null, canonical: "Constantine" }) };
  const { client } = scripted([
    [use("q1", "quote_delivery", quoteInput)],
    [use("c1", "create_order", { ...details, items: [{ variant_id: VARIANT, quantity: 1 }] })],
    [say("Summary.")],
  ]);
  const history = [
    { role: "assistant" as const, text: "Black Hoodie M is 3500 DA. Send your name, phone, wilaya and address." },
    { role: "user" as const, text: "Name Sofiane Amrani, 0770123456, Constantine, Targa Ouzemour 9. Order received." },
  ];
  // Lookups without the quote for this wilaya: the total matches the unit price, so only the quote check stops it.
  await runAgent({ client, catalog, store: STORE, history, orders: noFee, conversationId: "c1", customerId: "u1", lookups: [] });
  assert.equal(placed.length, 0);
});

test("an earlier quote for another wilaya does not unlock this wilaya's order", async () => {
  const placed: PlaceOrderInput[] = [];
  const { client } = scripted([
    [use("c1", "create_order", details)],
    [say("Summary.")],
  ]);
  const history = [
    { role: "assistant" as const, text: "• Total : 7700 DA\nConfirmez-vous ?" },
    { role: "user" as const, text: "oui" },
  ];
  await runAgent({ client, catalog, store: STORE, history, orders: orders(placed), conversationId: "c1", customerId: "u1", lookups: ["Delivery to Oran: 700 DZD"] });
  assert.equal(placed.length, 0);
});

test("the refusal tells the model not to call create_order again and to wait for the confirmation", async () => {
  const { client, requests } = scripted([
    [use("c1", "create_order", details)],
    [say("Summary: • Total: 7700 DA. Confirm?")],
  ]);
  await runAgent({
    client,
    catalog,
    store: STORE,
    history: [{ role: "user", text: "Here are my details." }],
    orders: orders([]),
    ...IDS,
  });
  const toolResult = JSON.stringify(requests[1].messages.at(-1)?.content);
  assert.match(toolResult, /Do not call create_order again in this turn/);
  assert.match(toolResult, /wait for their explicit confirmation in their next message/);
  assert.match(toolResult, /not a failure and not a reason to hand off/);
});

test("legit flow, turn 2: the summary was shown, the customer says yes, and quote is called again in that turn", async () => {
  const placed: PlaceOrderInput[] = [];
  const { client } = scripted([
    [use("q1", "quote_delivery", quoteInput)],
    [use("c1", "create_order", details)],
    [say("Commande reçue, total 7700 DA.")],
  ]);
  const history = [
    { role: "user" as const, text: "Name Sofiane Amrani, 0770123456, Constantine, Targa Ouzemour 9" },
    { role: "assistant" as const, text: "• Hoodie noir taille M × 2 : 7000 DA\n• Livraison : 700 DA\n• Total : 7700 DA\nConfirmez-vous ?" },
    { role: "user" as const, text: "yes, I confirm" },
  ];
  const r = await runAgent({ client, catalog, store: STORE, history, orders: orders(placed), ...IDS });
  assert.equal(placed.length, 1);
  assert.equal(r.toolCalls.find((t) => t.name === "create_order")?.is_error, false);
  assert.equal(r.handoffReason, null);
});

test("legit flow with quote and create in the same round, after the summary was shown", async () => {
  const placed: PlaceOrderInput[] = [];
  const { client } = scripted([
    [use("q1", "quote_delivery", quoteInput), use("c1", "create_order", details)],
    [say("Commande reçue.")],
  ]);
  const history = [
    { role: "assistant" as const, text: "• Total : 7700 DA\nConfirmez-vous ?" },
    { role: "user" as const, text: "oui" },
  ];
  await runAgent({ client, catalog, store: STORE, history, orders: orders(placed), ...IDS });
  assert.equal(placed.length, 1);
});

test("a summary that shows a different total does not unlock the order", async () => {
  const placed: PlaceOrderInput[] = [];
  const { client } = scripted([
    [use("c1", "create_order", details)],
    [say("Summary.")],
  ]);
  const history = [
    { role: "assistant" as const, text: "• Total : 3500 DA\nConfirmez-vous ?" },
    { role: "user" as const, text: "oui" },
  ];
  await runAgent({ client, catalog, store: STORE, history, orders: orders(placed), ...IDS });
  assert.equal(placed.length, 0);
});
