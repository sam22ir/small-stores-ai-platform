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

test("a customer turn with photos is sent as text plus image_url parts", async () => {
  const dataUrl = "data:image/png;base64,iVBORw==";
  const { fetchImpl, calls } = fakeFetch([text("Yes, that hoodie.")]);
  await runAgentChatCompletions({
    ...base,
    history: [
      { role: "user", text: "hello" },
      { role: "assistant", text: "Hi!" },
      { role: "user", text: "[image]", images: [{ dataUrl }] },
    ],
    fetchImpl,
  });
  const msgs = calls[0].body.messages;
  assert.equal(msgs.at(-1).role, "user");
  assert.deepEqual(msgs.at(-1).content, [
    { type: "text", text: "[image]" },
    { type: "image_url", image_url: { url: dataUrl } },
  ]);
  assert.equal(msgs[1].content, "hello"); // earlier turns stay plain text
  assert.equal(msgs[2].content, "Hi!");
});

test("text-only turns keep plain string content", async () => {
  const { fetchImpl, calls } = fakeFetch([text("Hi!")]);
  await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(calls[0].body.messages.at(-1).content, "black hoodie in M?");
});

test("a photo the endpoint refuses is retried once without photos, and the run still answers", async () => {
  const dataUrl = "data:image/png;base64,iVBORw==";
  const { fetchImpl, calls } = fakeFetch([
    { status: 400, body: { error: { message: "This model does not support image input" } } },
    text("I can't see the photo, but the owner can."),
  ]);
  const r = await runAgentChatCompletions({
    ...base,
    history: [{ role: "user", text: "[image]", images: [{ dataUrl }] }],
    fetchImpl,
  });
  assert.equal(r.reply, "I can't see the photo, but the owner can.");
  assert.equal(calls.length, 2);
  assert.ok(Array.isArray(calls[0].body.messages.at(-1).content));
  assert.equal(calls[1].body.messages.at(-1).content, "[image]");
});

test("after a refusal the rest of the run stays text-only", async () => {
  const dataUrl = "data:image/png;base64,iVBORw==";
  const { fetchImpl, calls } = fakeFetch([
    { status: 400, body: { error: { message: "image input not supported" } } },
    toolCall("search_products", '{"query":"hoodie"}'),
    text("Done."),
  ]);
  await runAgentChatCompletions({
    ...base,
    history: [{ role: "user", text: "[image]", images: [{ dataUrl }] }],
    fetchImpl,
  });
  assert.equal(calls.length, 3);
  for (const c of calls.slice(1)) {
    assert.ok(c.body.messages.some((m: { content: unknown }) => m.content === "[image]"));
    assert.ok(c.body.messages.every((m: { content: unknown }) => !Array.isArray(m.content)));
  }
});

test("a refusal that still fails without photos throws, so it counts as a provider failure", async () => {
  const dataUrl = "data:image/png;base64,iVBORw==";
  const { fetchImpl } = fakeFetch([
    { status: 400, body: { error: { message: "image input not supported" } } },
    { status: 400, body: { error: { message: "bad request" } } },
  ]);
  await assert.rejects(
    runAgentChatCompletions({ ...base, history: [{ role: "user", text: "[image]", images: [{ dataUrl }] }], fetchImpl }),
    /LLM request failed \(400\)/,
  );
});

test("an ordinary 400 (not about images) is not retried", async () => {
  const dataUrl = "data:image/png;base64,iVBORw==";
  const { fetchImpl, calls } = fakeFetch([{ status: 400, body: { error: { message: "invalid api key" } } }]);
  await assert.rejects(
    runAgentChatCompletions({ ...base, history: [{ role: "user", text: "[image]", images: [{ dataUrl }] }], fetchImpl }),
    /LLM request failed \(400\)/,
  );
  assert.equal(calls.length, 1);
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
  assert.equal(calls.length, 6);
  assert.equal(r.reply, HANDOFF_HOLDING_REPLY);
});

test("failed tool calls record their error text", async () => {
  const failing: Catalog = {
    async searchProducts() { throw { message: "relation exploded" }; },
    async getProduct() { return null; },
  };
  const { fetchImpl } = fakeFetch([toolCall("search_products", '{"query":"x"}'), text("Let me ask the owner.")]);
  const r = await runAgentChatCompletions({ ...base, catalog: failing, fetchImpl });
  assert.equal(r.toolCalls[0].error, "relation exploded");
});

test("token parameter, reasoning effort and temperature are configurable", async () => {
  const a = fakeFetch([text("ok")]);
  await runAgentChatCompletions({
    ...base, fetchImpl: a.fetchImpl,
    tokenParam: "max_completion_tokens", reasoningEffort: "none", temperature: 0.3,
  });
  assert.equal(a.calls[0].body.max_completion_tokens, 2048);
  assert.equal(a.calls[0].body.max_tokens, undefined);
  assert.equal(a.calls[0].body.reasoning_effort, "none");
  assert.equal(a.calls[0].body.temperature, 0.3);

  // Defaults: legacy token name, and neither reasoning_effort nor temperature is sent.
  const b = fakeFetch([text("ok")]);
  await runAgentChatCompletions({ ...base, fetchImpl: b.fetchImpl });
  assert.equal(b.calls[0].body.max_tokens, 2048);
  assert.equal(b.calls[0].body.max_completion_tokens, undefined);
  assert.equal("reasoning_effort" in b.calls[0].body, false);
  assert.equal("temperature" in b.calls[0].body, false);
});

test("maxAttempts: 1 disables the retry on 429", async () => {
  const { fetchImpl, calls } = fakeFetch([{ status: 429, body: { error: "slow" } }, text("never reached")]);
  await assert.rejects(runAgentChatCompletions({ ...base, fetchImpl, maxAttempts: 1 }), /429/);
  assert.equal(calls.length, 1);
});

test("handoff summary travels with the handoff reason (chat completions)", async () => {
  const { fetchImpl } = fakeFetch([
    toolCall("handoff_to_owner", '{"reason":"wants to order","summary":"Hoodie M x2, Oran."}'),
    text("The owner will reply."),
  ]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.handoffSummary, "Hoodie M x2, Oran.");
});

test("a handoff without a summary field has a null summary (chat completions)", async () => {
  const { fetchImpl } = fakeFetch([toolCall("handoff_to_owner", '{"reason":"wants to order"}'), text("The owner will reply.")]);
  const r = await runAgentChatCompletions({ ...base, fetchImpl });
  assert.equal(r.handoffReason, "wants to order");
  assert.equal(r.handoffSummary, null);
});
