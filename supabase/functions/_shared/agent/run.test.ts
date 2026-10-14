import { test } from "node:test";
import assert from "node:assert/strict";
import type Anthropic from "@anthropic-ai/sdk";
import { dedupeRepeatedText, runAgent, toMessageParams, truncateUtf8, HANDOFF_HOLDING_REPLY } from "./run.ts";
import { availability, errorText } from "./tools.ts";
import { buildSystemPrompt } from "./prompt.ts";
import type { Catalog, ProductRecord, StoreContext } from "./types.ts";

const STORE: StoreContext = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test Shop",
  currency: "USD",
  business_info: "Open daily 10-18",
};

const HOODIE: ProductRecord = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Black Hoodie",
  description: "Heavy cotton",
  price_cents: 4500,
  variants: [
    { id: "v1", label: "M", price_cents: null, stock_quantity: 3 },
    { id: "v2", label: "L", price_cents: null, stock_quantity: 120 },
    { id: "v3", label: "XL", price_cents: null, stock_quantity: 0 },
  ],
};

function fakeCatalog() {
  const calls: { method: string; storeId: string }[] = [];
  const catalog: Catalog = {
    async searchProducts(storeId) {
      calls.push({ method: "search", storeId });
      return [HOODIE];
    },
    async getProduct(storeId, id) {
      calls.push({ method: "get", storeId });
      return id === HOODIE.id ? HOODIE : null;
    },
  };
  return { catalog, calls };
}

type Scripted = { content: unknown[]; stop_reason: string };

// Replays scripted responses and records every request.
function fakeClient(script: Scripted[]) {
  const requests: any[] = [];
  const client = {
    beta: {
      messages: {
        async create(params: any) {
          requests.push(structuredClone(params));
          const next = script.shift();
          if (!next) throw new Error("script exhausted");
          return { usage: { input_tokens: 10, output_tokens: 5 }, ...next };
        },
      },
    },
  } as unknown as Anthropic;
  return { client, requests };
}

const text = (t: string) => ({ type: "text", text: t });
const toolUse = (id: string, name: string, input: unknown) => ({ type: "tool_use", id, name, input });
const ask = (t: string) => [{ role: "user" as const, text: t }];

test("answers directly when no tool is needed", async () => {
  const { catalog } = fakeCatalog();
  const { client } = fakeClient([{ content: [text("Hi! How can I help?")], stop_reason: "end_turn" }]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("hello") });
  assert.equal(r.reply, "Hi! How can I help?");
  assert.equal(r.handoffReason, null);
  assert.deepEqual(r.usage, { input_tokens: 10, output_tokens: 5 });
});

test("search tool results go back to the model, scoped to the store", async () => {
  const { catalog, calls } = fakeCatalog();
  const { client, requests } = fakeClient([
    // The model tries to smuggle another store's id; it must be ignored.
    { content: [toolUse("t1", "search_products", { query: "hoodie", store_id: "evil" })], stop_reason: "tool_use" },
    { content: [text("Yes, the black hoodie is in stock!")], stop_reason: "end_turn" },
  ]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("black hoodie?") });
  assert.equal(r.reply, "Yes, the black hoodie is in stock!");
  assert.deepEqual(calls, [{ method: "search", storeId: STORE.id }]);
  assert.equal(r.toolCalls[0].name, "search_products");

  const result = requests[1].messages.at(-1).content[0];
  assert.equal(result.type, "tool_result");
  assert.equal(result.tool_use_id, "t1");
});

test("exact stock is hidden unless low", () => {
  assert.equal(availability(0), "out_of_stock");
  assert.equal(availability(3), "low_stock");
  assert.equal(availability(120), "in_stock");
});

test("tool output never exposes large exact quantities or sku", async () => {
  const { catalog } = fakeCatalog();
  const { client, requests } = fakeClient([
    { content: [toolUse("t1", "search_products", { query: "" })], stop_reason: "tool_use" },
    { content: [text("ok")], stop_reason: "end_turn" },
  ]);
  await runAgent({ client, catalog, store: STORE, history: ask("what do you have") });
  const out = requests[1].messages.at(-1).content[0].content as string;
  assert.ok(!out.includes("120"), "exact in-stock quantity leaked");
  assert.ok(out.includes('"units_left":3'), "low stock count should be visible");
  assert.ok(out.includes("$45.00"));
});

test("check_stock rejects ids that did not come from search", async () => {
  const { catalog, calls } = fakeCatalog();
  const { client, requests } = fakeClient([
    { content: [toolUse("t1", "check_stock", { product_id: "not-a-uuid" })], stop_reason: "tool_use" },
    { content: [text("Let me check with the owner.")], stop_reason: "end_turn" },
  ]);
  await runAgent({ client, catalog, store: STORE, history: ask("stock?") });
  assert.equal(calls.length, 0);
  assert.equal(requests[1].messages.at(-1).content[0].is_error, true);
});

test("handoff tool sets the handoff reason and keeps the model's reply", async () => {
  const { catalog } = fakeCatalog();
  const { client } = fakeClient([
    { content: [toolUse("t1", "handoff_to_owner", { reason: "Wants to order 2 hoodies" })], stop_reason: "tool_use" },
    { content: [text("The owner will message you shortly!")], stop_reason: "end_turn" },
  ]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("I want to buy 2") });
  assert.equal(r.handoffReason, "Wants to order 2 hoodies");
  assert.equal(r.reply, "The owner will message you shortly!");
});

test("a refusal hands off with a safe holding reply", async () => {
  const { catalog } = fakeCatalog();
  const { client } = fakeClient([{ content: [], stop_reason: "refusal" }]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("hi") });
  assert.equal(r.reply, HANDOFF_HOLDING_REPLY);
  assert.ok(r.handoffReason);
});

test("a cut-off answer is never sent", async () => {
  const { catalog } = fakeCatalog();
  const { client } = fakeClient([{ content: [text("The black hoo")], stop_reason: "max_tokens" }]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("hi") });
  assert.equal(r.reply, HANDOFF_HOLDING_REPLY);
});

test("gives up after too many tool rounds", async () => {
  const { catalog } = fakeCatalog();
  const loop = Array.from({ length: 10 }, (_, i) => ({
    content: [toolUse(`t${i}`, "get_store_info", {})],
    stop_reason: "tool_use",
  }));
  const { client, requests } = fakeClient(loop);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("hi") });
  assert.equal(requests.length, 6);
  assert.equal(r.reply, HANDOFF_HOLDING_REPLY);
  assert.ok(r.handoffReason);
});

test("a throwing tool becomes an error result instead of crashing the run", async () => {
  const catalog: Catalog = {
    async searchProducts() { throw new Error("db down"); },
    async getProduct() { return null; },
  };
  const { client, requests } = fakeClient([
    { content: [toolUse("t1", "search_products", { query: "x" })], stop_reason: "tool_use" },
    { content: [text("I'll ask the owner.")], stop_reason: "end_turn" },
  ]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("x?") });
  assert.equal(r.reply, "I'll ask the owner.");
  assert.equal(requests[1].messages.at(-1).content[0].is_error, true);
});

test("frontier models send effort and fallback params; others don't", async () => {
  const { catalog } = fakeCatalog();
  const a = fakeClient([{ content: [text("hi")], stop_reason: "end_turn" }]);
  await runAgent({ client: a.client, catalog, store: STORE, history: ask("hi") });
  assert.equal(a.requests[0].fallbacks, "default");
  assert.equal(a.requests[0].output_config.effort, "low");

  const b = fakeClient([{ content: [text("hi")], stop_reason: "end_turn" }]);
  await runAgent({ client: b.client, catalog, store: STORE, history: ask("hi"), model: "claude-haiku-4-5" });
  assert.equal(b.requests[0].fallbacks, undefined);
  assert.equal(b.requests[0].output_config, undefined);
});

test("history: leading assistant turns dropped, same-role turns merged", () => {
  const msgs = toMessageParams([
    { role: "assistant", text: "Welcome!" },
    { role: "user", text: "hi" },
    { role: "user", text: "do you have hoodies" },
    { role: "assistant", text: "Yes" },
    { role: "user", text: "price?" },
  ]);
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"]);
  assert.equal(msgs[0].content, "hi\ndo you have hoodies");
});

test("photos become Anthropic image blocks after the text, and merge with same-role turns", () => {
  const dataUrl = "data:image/jpeg;base64,/9j/AA==";
  const msgs = toMessageParams([
    { role: "user", text: "[image]" },
    { role: "user", text: "is this one available?", images: [{ dataUrl }] },
  ]);
  assert.equal(msgs.length, 1);
  assert.deepEqual(msgs[0].content, [
    { type: "text", text: "[image]\nis this one available?" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: "/9j/AA==" } },
  ]);
});

test("a malformed or unsupported data URL is dropped instead of sent", () => {
  const msgs = toMessageParams([
    { role: "user", text: "look", images: [{ dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" }, { dataUrl: "not a url" }] },
  ]);
  assert.equal(msgs[0].content, "look");
});

test("replies are truncated by UTF-8 bytes", () => {
  const long = "م".repeat(1000); // 2 bytes each
  const out = truncateUtf8(long, 950);
  assert.ok(new TextEncoder().encode(out).length <= 950);
  assert.ok(out.endsWith("…"));
  assert.equal(truncateUtf8("short", 950), "short");
});

test("history must end with a customer message", async () => {
  const { catalog } = fakeCatalog();
  const { client } = fakeClient([]);
  await assert.rejects(
    runAgent({ client, catalog, store: STORE, history: [{ role: "assistant", text: "hi" }] }),
  );
});

test("a failing tool's error text is recorded for debugging", async () => {
  // PostgREST errors are plain objects, not Error instances.
  const catalog: Catalog = {
    async searchProducts() { throw { code: "PGRST201", message: "Could not embed" }; },
    async getProduct() { return null; },
  };
  const { client } = fakeClient([
    { content: [toolUse("t1", "search_products", { query: "x" })], stop_reason: "tool_use" },
    { content: [text("I'll ask the owner.")], stop_reason: "end_turn" },
  ]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("x?") });
  assert.equal(r.toolCalls[0].is_error, true);
  assert.equal(r.toolCalls[0].error, "Could not embed");
  assert.equal(errorText(new Error("boom")), "boom");
  assert.equal(errorText("plain"), "plain");
});

test("prompt forbids offering to hold or reserve items", () => {
  const p = buildSystemPrompt(STORE);
  assert.match(p, /Never offer to hold, reserve or set aside/);
  assert.match(p, /must first call handoff_to_owner/);
  assert.match(p, /Test Shop/);
});

test("handoff summary travels with the handoff reason", async () => {
  const { catalog } = fakeCatalog();
  const { client } = fakeClient([
    {
      content: [toolUse("t1", "handoff_to_owner", { reason: "Wants 2 hoodies", summary: "Black hoodie, size M, x2, Oran." })],
      stop_reason: "tool_use",
    },
    { content: [text("The owner will message you shortly!")], stop_reason: "end_turn" },
  ]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("I want to buy 2") });
  assert.equal(r.handoffSummary, "Black hoodie, size M, x2, Oran.");
});

test("no summary without a handoff, and none for a run-level handoff", async () => {
  const { catalog } = fakeCatalog();
  const plain = await runAgent({
    client: fakeClient([{ content: [text("Hi!")], stop_reason: "end_turn" }]).client,
    catalog,
    store: STORE,
    history: ask("hi"),
  });
  assert.equal(plain.handoffSummary, null);
  const refused = await runAgent({
    client: fakeClient([{ content: [], stop_reason: "refusal" }]).client,
    catalog,
    store: STORE,
    history: ask("hi"),
  });
  assert.equal(refused.handoffSummary, null);
});

// Shapes from the stress run: LG-011 (whole message twice, no space between copies), AD-039 (one sentence twice, then more).
const LG_011 = "Le hoodie noir taille M est disponible à 3 500 DZD. Pour finaliser, donnez-moi votre nom complet, votre numéro, la wilaya et l'adresse complète.";
const AD_039_FIRST = "باش نكمل الطلب، ابعثلي اسمك الكامل ورقم هاتفك والولاية والعنوان الكامل.";
const AD_039_NEXT = "لقيت Jean slim bleu مقاس 38";

test("dedupe: a whole reply written twice, with or without a space, becomes one copy", () => {
  assert.equal(dedupeRepeatedText(`${LG_011}${LG_011}`), LG_011);
  assert.equal(dedupeRepeatedText(`${LG_011} ${LG_011}`), LG_011);
  assert.equal(dedupeRepeatedText(`${LG_011}\n${LG_011}`), LG_011);
});

test("dedupe: a sentence repeated back to back is removed, the rest is kept as written", () => {
  assert.equal(
    dedupeRepeatedText(`${AD_039_FIRST}${AD_039_FIRST} ${AD_039_NEXT}`),
    `${AD_039_FIRST} ${AD_039_NEXT}`,
  );
});

test("dedupe: repeated bullet lines and paragraphs are removed, layout kept", () => {
  assert.equal(
    dedupeRepeatedText("• Total: 2700 DZD\n• Total: 2700 DZD\nVoulez-vous confirmer ?"),
    "• Total: 2700 DZD\nVoulez-vous confirmer ?",
  );
  assert.equal(dedupeRepeatedText(`${LG_011}\n\n${LG_011}`), LG_011);
});

test("dedupe: distinct text and short repeats are returned unchanged", () => {
  const list = "Voici les options.\n• Black cap (one size): 1500 DZD\n• Delivery to Tébessa: 1200 DZD\nSouhaitez-vous commander ?";
  assert.equal(dedupeRepeatedText(list), list);
  assert.equal(dedupeRepeatedText("Oui. Oui."), "Oui. Oui.");
  assert.equal(dedupeRepeatedText("Bonjour, je suis là."), "Bonjour, je suis là.");
});

test("two identical text blocks in the final answer are sent once", async () => {
  const { catalog } = fakeCatalog();
  const { client } = fakeClient([
    { content: [text(LG_011), text(LG_011)], stop_reason: "end_turn" },
  ]);
  const r = await runAgent({ client, catalog, store: STORE, history: ask("je veux le hoodie noir taille M") });
  assert.equal(r.reply, LG_011);
});
