import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { handleInbound, type StoreSettings } from "./pipeline.ts";

// A tiny in-memory stand-in for the parts of supabase-js the pipeline uses.
type Row = Record<string, unknown>;

class Query {
  private op: "select" | "insert" | "update" = "select";
  private payload: Row = {};
  private filters: ((r: Row) => boolean)[] = [];
  private head = false;
  private wantCount = false;
  private descending = false;
  private max = Infinity;
  private tables: Record<string, Row[]>;
  private table: string;

  constructor(tables: Record<string, Row[]>, table: string) {
    this.tables = tables;
    this.table = table;
  }

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    this.head = !!opts?.head;
    this.wantCount = !!opts?.count;
    return this;
  }
  insert(row: Row) {
    this.op = "insert";
    this.payload = row;
    return this;
  }
  update(patch: Row) {
    this.op = "update";
    this.payload = patch;
    return this;
  }
  eq(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  is(col: string, v: unknown) {
    this.filters.push((r) => r[col] === v);
    return this;
  }
  gte(col: string, v: string) {
    this.filters.push((r) => String(r[col]) >= v);
    return this;
  }
  order(_col: string, opts?: { ascending?: boolean }) {
    this.descending = opts?.ascending === false;
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  then(resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) {
    try {
      return Promise.resolve(this.run()).then(resolve, reject);
    } catch (e) {
      return Promise.reject(e).then(resolve, reject);
    }
  }
  private run() {
    const rows = this.tables[this.table] ??= [];
    if (this.op === "insert") {
      const defaults: Row = this.table === "agent_runs"
        ? { fast_path: false, error: null, source: "customer" }
        : {};
      rows.push({ ...defaults, ...this.payload, created_at: new Date().toISOString(), _seq: rows.length });
      return { data: null, error: null };
    }
    const matching = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of matching) Object.assign(r, this.payload);
      return { data: null, error: null };
    }
    if (this.head) return { data: null, count: matching.length, error: null };
    const sorted = [...matching].sort((a, b) => (Number(a._seq) - Number(b._seq)) * (this.descending ? -1 : 1));
    return {
      data: sorted.slice(0, this.max),
      count: this.wantCount ? matching.length : undefined,
      error: null,
    };
  }
}

function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  return { from: (t: string) => new Query(tables, t) } as unknown as SupabaseClient;
}

const store: StoreSettings = {
  id: "s1",
  name: "Demo Boutique",
  currency: "DZD",
  business_info: null,
  agent_enabled: true,
  monthly_reply_limit: 2,
};

const env = (k: string) =>
  ({
    LLM_PROVIDER: "openai-compatible",
    LLM_BASE_URL: "https://llm.example/v1",
    LLM_API_KEY: "k",
    LLM_MODEL: "test-model",
  } as Record<string, string>)[k];

function setup(opts: { status?: string; messages?: Row[]; runs?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    messages: opts.messages ?? [
      { conversation_id: "c1", direction: "inbound", body: "do you ship to Oran?", _seq: 0 },
    ],
    agent_runs: opts.runs ?? [],
    conversations: [{ id: "c1", status: opts.status ?? "bot", handoff_reason: null }],
  };
  return {
    tables,
    input: (text: string, source: "customer" | "test" | "dev" = "customer", overrides: Partial<StoreSettings> = {}) => ({
      db: fakeDb(tables),
      env,
      store: { ...store, ...overrides },
      channelId: "ch1",
      conversation: { id: "c1", status: opts.status ?? "bot" },
      customerId: "u1",
      inboundMessageId: "m1",
      text,
      source,
    }),
  };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubLlm(reply: string, calls: { n: number }) {
  globalThis.fetch = (() => {
    calls.n++;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: reply }, finish_reason: "stop" }],
          usage: { prompt_tokens: 120, completion_tokens: 12 },
        }),
        { status: 200 },
      ),
    );
  }) as typeof fetch;
}

test("a greeting is answered by the fast path: no model call, logged as free", async () => {
  const { tables, input } = setup();
  const calls = { n: 0 };
  stubLlm("should not be used", calls);
  const r = await handleInbound(input("Bonjour"));
  assert.ok(r.ok && r.fast_path);
  assert.match(r.ok ? r.reply ?? "" : "", /Bonjour et bienvenue chez Demo Boutique/);
  assert.equal(calls.n, 0);
  const run = tables.agent_runs[0];
  assert.equal(run.fast_path, true);
  assert.equal(run.source, "customer");
  assert.equal(tables.messages.at(-1)?.sender, "agent");
  assert.equal(tables.messages.at(-1)?.delivery_status, "pending"); // customer replies wait for the Meta sender
});

test("a normal message runs the model, stores reply and token usage", async () => {
  const { tables, input } = setup();
  const calls = { n: 0 };
  stubLlm("Yes, we ship to Oran.", calls);
  const r = await handleInbound(input("do you ship to Oran?"));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.reply, "Yes, we ship to Oran.");
  assert.equal(r.status, "bot");
  assert.equal(calls.n, 1);
  const run = tables.agent_runs[0];
  assert.equal(run.input_tokens, 120);
  assert.equal(run.output_tokens, 12);
  assert.equal(run.model, "test-model");
  assert.equal(run.provider, "llm.example");
  assert.equal(run.fast_path, false);
});

test("test chats are tagged, delivered immediately and never counted as customer usage", async () => {
  const { tables, input } = setup({ runs: [] });
  stubLlm("Sure.", { n: 0 });
  await handleInbound(input("hi there, got hoodies?", "test"));
  assert.equal(tables.agent_runs[0].source, "test");
  assert.equal(tables.messages.at(-1)?.delivery_status, "sent");
});

test("over the monthly limit: no model call, holding reply, conversation goes to the owner", async () => {
  const runs = [
    { store_id: "s1", source: "customer", fast_path: false, error: null, created_at: new Date().toISOString() },
    { store_id: "s1", source: "customer", fast_path: false, error: null, created_at: new Date().toISOString() },
  ].map((r, i) => ({ ...r, _seq: i }));
  const { tables, input } = setup({ runs });
  const calls = { n: 0 };
  stubLlm("nope", calls);
  const r = await handleInbound(input("do you ship to Oran?"));
  assert.ok(r.ok && r.limited);
  assert.equal(calls.n, 0);
  assert.equal(tables.conversations[0].status, "human");
  assert.match(String(tables.conversations[0].handoff_reason), /limit/i);
});

test("the limit notice is written in the customer's language", async () => {
  const now = new Date().toISOString();
  const runs = [0, 1].map((i) => ({ store_id: "s1", source: "customer", fast_path: false, error: null, created_at: now, _seq: i }));
  const { input } = setup({ runs });
  stubLlm("nope", { n: 0 });
  const ar = await handleInbound(input("هل عندكم هودي أسود؟"));
  assert.ok(ar.ok && /[\u0600-\u06ff]/.test(ar.reply ?? ""));
  const fr = await handleInbound(input("Bonjour, vous livrez à Oran ?"));
  assert.ok(fr.ok && /Merci pour votre message/.test(fr.reply ?? ""));
});

test("failed runs, test runs and fast-path runs don't use up the allowance", async () => {
  const now = new Date().toISOString();
  const runs = [
    { store_id: "s1", source: "customer", fast_path: false, error: "boom", created_at: now },
    { store_id: "s1", source: "test", fast_path: false, error: null, created_at: now },
    { store_id: "s1", source: "customer", fast_path: true, error: null, created_at: now },
  ].map((r, i) => ({ ...r, _seq: i }));
  const { input } = setup({ runs });
  stubLlm("Yes.", { n: 0 });
  const r = await handleInbound(input("do you ship to Oran?"));
  assert.ok(r.ok && !r.limited && r.reply === "Yes.");
});

test("a conversation with the owner stays silent, and so does a disabled assistant", async () => {
  const human = setup({ status: "human" });
  const calls = { n: 0 };
  stubLlm("x", calls);
  const r1 = await handleInbound(human.input("hello?"));
  assert.ok(r1.ok && r1.reply === null && r1.status === "human");

  const off = setup();
  const r2 = await handleInbound(off.input("do you ship?", "customer", { agent_enabled: false }));
  assert.ok(r2.ok && r2.reply === null);
  // ...but the owner can still try it from the dashboard.
  const r3 = await handleInbound(off.input("do you ship?", "test", { agent_enabled: false }));
  assert.ok(r3.ok && r3.reply !== null);
  assert.equal(calls.n, 1);
});

test("a handoff from the model flips the conversation to the owner", async () => {
  const { tables, input } = setup();
  let call = 0;
  globalThis.fetch = (() => {
    call++;
    const message = call === 1
      ? {
        content: null,
        tool_calls: [{ id: "t1", type: "function", function: { name: "handoff_to_owner", arguments: '{"reason":"wants a discount"}' } }],
      }
      : { content: "The owner will reply to you personally." };
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }], usage: {} }), { status: 200 }));
  }) as typeof fetch;
  const r = await handleInbound(input("can I get 20% off?"));
  assert.ok(r.ok && r.status === "human" && r.handoff === "wants a discount");
  assert.equal(tables.conversations[0].status, "human");
  assert.deepEqual(r.ok ? r.tool_calls : [], ["handoff_to_owner"]);
});

test("when every provider fails the error is logged and nothing is sent to the customer", async () => {
  const { tables, input } = setup();
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  const r = await handleInbound(input("do you ship to Oran?"));
  assert.equal(r.ok, false);
  const run = tables.agent_runs[0];
  assert.match(String(run.error), /All model providers failed/);
  assert.equal(tables.messages.filter((m) => m.sender === "agent").length, 0);
});
