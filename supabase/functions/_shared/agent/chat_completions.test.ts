import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgentChatCompletions, stripThinking } from "./chat_completions.ts";
import { HANDOFF_HOLDING_REPLY } from "./run.ts";
import type { Catalog, ProductRecord, StoreContext } from "./types.ts";

const STORE: StoreContext = {
  id: "11111111-1111-1111-1111-111111111111",
  name: "Test Shop",
  currency: "USD",
  business_info: null,
};
const HOODIE: ProductRecord = {
  id: "22222222-2222-2222-2222-222222222222",
  name: "Black Hoodie",
  description: null,
  price_cents: 4500,
  variants: [{ id: "v1", label: "M", price_cents: null, stock_quantity: 3 }],
};
const seen: string[] = [];
const catalog: Catalog = {
  async searchProducts(storeId) { seen.push(storeId); return [HOODIE]; },
  async getProduct() { return null; },
};
const ask = [{ role: "user" as const, text: "black hoodie in M?" }];

type Reply = { status?: number; body?: unknown };
function fakeFetch(script: Reply[]) {
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const fetchImpl = (async (url: string, init: any) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    const next = script.shift();
    if (!next) throw new Error("script exhausted");
    const status = next.status ?? 200;
    return new Response(JSON.stringify(next.body ?? {}), { status });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}
const text = (content: string, extra: object = {}) => ({
  body: { choices: [{ message: { content }, finish_reason: "stop", ...extra }], usage: { prompt_tokens: 7, completion_tokens: 3 } },
});
const toolCall = (name: string, args: string, id = "c1") => ({
  body: { choices: [{ message: { content: null, tool_calls: [{ id, type: "function", function: { name, arguments: args } }] }, finish_reason: "tool_calls" }] },
});
const base = { baseUrl: "https://api.example.com/v1/", apiKey: "sk-test", model: "free/model:free", catalog, store: STORE, history: ask, retryDelayMs: 1 };

test("sends an OpenAI-style request with bearer auth and function tools", async () => {
  const { fetchImpl, calls } = fakeFetch([text("Hi!")]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.reply, "Hi!");
  assert.deepEqual(r.usage, { input_tokens: 7, output_tokens: 3 });
  assert.equal(calls[0].url, "https://api.example.com/v1/chat/completions");
  assert.equal(calls[0].headers.authorization, "Bearer sk-test");
  assert.equal(calls[0].body.model, "free/model:free");
  assert.equal(calls[0].body.messages[0].role, "system");
  assert.equal(calls[0].body.tools.length, 4);
  assert.equal(calls[0].body.tools[0].type, "function");
  assert.equal(calls[0].body.tools[0].function.name, "search_products");
});

test("runs tool calls, scoped to the store, and returns the final answer", async () => {
  seen.length = 0;
  const { fetchImpl, calls } = fakeFetch([
    toolCall("search_products", '{"query":"hoodie","store_id":"evil"}'),
    text("Only 3 left in M!"),
  ]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.reply, "Only 3 left in M!");
  assert.deepEqual(seen, [STORE.id]);
  const second = calls[1].body.messages;
  assert.equal(second.at(-2).role, "assistant");
  assert.equal(second.at(-1).role, "tool");
  assert.equal(second.at(-1).tool_call_id, "c1");
});

test("invalid tool-argument JSON becomes a tool error, not a crash", async () => {
  const { fetchImpl, calls } = fakeFetch([toolCall("search_products", "{oops"), text("Let me ask the owner.")]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.reply, "Let me ask the owner.");
  assert.equal(r.toolCalls[0].is_error, true);
  assert.match(calls[1].body.messages.at(-1).content, /not valid JSON/);
});

test("handoff tool sets the reason", async () => {
  const { fetchImpl } = fakeFetch([toolCall("handoff_to_owner", '{"reason":"wants to order"}'), text("The owner will reply.")]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.handoffReason, "wants to order");
});

test("strips <think> blocks; an unclosed think block yields a safe handoff", async () => {
  assert.equal(stripThinking("<think>hmm</think>Hello"), "Hello");
  assert.equal(stripThinking("<think>never finishes"), "");
  const { fetchImpl } = fakeFetch([text("<think>never finishes")]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.reply, HANDOFF_HOLDING_REPLY);
  assert.ok(r.handoffReason);
});

test("a length cut-off is never sent to the customer", async () => {
  const { fetchImpl } = fakeFetch([text("The black ho", { finish_reason: "length" })]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.reply, HANDOFF_HOLDING_REPLY);
});

test("retries once on 429 then succeeds", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 429, body: { error: "slow down" } }, text("ok")]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.reply, "ok");
  assert.equal(calls.length, 2);
});

test("a persistent error throws without leaking the api key", async () => {
  const { fetchImpl } = fakeFetch([{ status: 401, body: { error: "bad key" } }]);
  await assert.rejects(runAgentChatCompletions({ ...base, fetchImpl }), (e: Error) => {
    assert.match(e.message, /401/);
    assert.ok(!e.message.includes("sk-test"));
    return true;
  });
});

test("gives up after too many tool rounds", async () => {
  const { fetchImpl, calls } = fakeFetch(Array.from({ length: 9 }, () => toolCall("get_store_info", "{}")));
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(calls.length, 5);
  assert.equal(r.reply, HANDOFF_HOLDING_REPLY);
});
