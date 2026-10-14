import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUsage, handleInbound, type StoreSettings } from "./pipeline.ts";
import { creditRpc } from "./testing/memdb.ts";

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
  private offset = 0;
  private single = false;
  private tables: Record<string, Row[]>;
  private table: string;

  constructor(tables: Record<string, Row[]>, table: string) {
    this.tables = tables;
    this.table = table;
  }

  private returning = false;
  private batch: Row[] | null = null; // insert of several rows at once
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === "update") this.returning = true;
    this.head = !!opts?.head;
    this.wantCount = !!opts?.count;
    return this;
  }
  insert(row: Row | Row[]) {
    this.op = "insert";
    this.payload = row as Row;
    this.batch = Array.isArray(row) ? row : null;
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
  // Only the product search's OR filter is needed here: treated as matching every row.
  or(_expr: string) {
    return this;
  }
  not(col: string, _op: string, _v: unknown) {
    this.filters.push((r) => r[col] !== null && r[col] !== undefined);
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
  range(from: number, to: number) {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }
  maybeSingle() {
    this.single = true;
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
      for (const row of this.batch ?? [this.payload]) {
        rows.push({
          ...defaults,
          id: `${this.table}-${rows.length + 1}`,
          ...row,
          created_at: new Date().toISOString(),
          _seq: rows.length,
        });
      }
      return { data: null, error: null };
    }
    const matching = rows.filter((r) => this.filters.every((f) => f(r)));
    if (this.op === "update") {
      for (const r of matching) Object.assign(r, this.payload);
      if (!this.returning) return { data: null, error: null };
      return { data: this.single ? (matching[0] ?? null) : matching, error: null };
    }
    if (this.head) return { data: null, count: matching.length, error: null };
    const sorted = [...matching].sort((a, b) => (Number(a._seq) - Number(b._seq)) * (this.descending ? -1 : 1));
    if (this.single) return { data: sorted[0] ?? null, error: null };
    return {
      data: sorted.slice(this.offset, this.offset + this.max),
      count: this.wantCount ? matching.length : undefined,
      error: null,
    };
  }
}

// Conversation locks, shared with the tests so they can hold or free them.
const locks = new Set<string>();
const rpcCalls: string[] = [];
// Makes consume_reply_credit / add_reply_credits fail, as if the database were unreachable.
let creditRpcError = false;

function fakeDb(tables: Record<string, Row[]>): SupabaseClient {
  return {
    from: (t: string) => new Query(tables, t),
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push(name);
      if (name === "consume_reply_credit" || name === "add_reply_credits") {
        if (creditRpcError) return Promise.resolve({ data: null, error: { message: "rpc unavailable" } });
        return Promise.resolve(creditRpc(tables, name, args) ?? { data: null, error: null });
      }
      const id = args.p_conversation_id as string;
      if (name === "claim_conversation") {
        if (locks.has(id)) return Promise.resolve({ data: false, error: null });
        locks.add(id);
        return Promise.resolve({ data: true, error: null });
      }
      locks.delete(id);
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient;
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
    BILLING_ENFORCED: "true",
  } as Record<string, string>)[k];

function setup(opts: { status?: string; messages?: Row[]; runs?: Row[] } = {}) {
  const tables: Record<string, Row[]> = {
    messages: opts.messages ?? [
      { id: "m1", conversation_id: "c1", direction: "inbound", body: "do you ship to Oran?", _seq: 0 },
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
  locks.clear();
  rpcCalls.length = 0;
  creditRpcError = false;
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

test("over the monthly token cap: no model call, owner alerted once per month", async () => {
  const runs = [
    {
      store_id: "s1",
      source: "customer",
      fast_path: false,
      error: null,
      created_at: new Date().toISOString(),
      input_tokens: 90,
      output_tokens: 10,
      _seq: 0,
    },
  ];
  const { tables, input } = setup({ runs });
  const calls = { n: 0 };
  stubLlm("nope", calls);
  const sent: string[] = [];
  const notify = (_storeId: string, text: string) => {
    sent.push(text);
    return Promise.resolve(true);
  };
  const capped = { ai_monthly_token_limit: 100 };

  const r = await handleInbound({ ...input("do you ship to Oran?", "customer", capped), notify });
  assert.ok(r.ok && r.limited);
  assert.equal(calls.n, 0);
  assert.equal(tables.conversations[0].status, "human");
  assert.match(String(tables.conversations[0].handoff_reason), /token cap/i);
  assert.equal(tables.store_ai_cap_alerts.length, 1);

  // Second capped message in the same month: handled the same way, but no second alert.
  tables.conversations[0].status = "bot";
  await handleInbound({ ...input("still there?", "customer", capped), notify });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(calls.n, 0);
  assert.equal(sent.length, 1);
});

test("trial over and not paid: no model call, owner alerted once per lapse", async () => {
  const { tables, input } = setup();
  tables.stores = [{ id: "s1", billing_alerted_for: null, _seq: 0 }];
  const calls = { n: 0 };
  stubLlm("nope", calls);
  const sent: string[] = [];
  const notify = (_storeId: string, text: string) => {
    sent.push(text);
    return Promise.resolve(true);
  };
  const expired = {
    trial_ends_at: new Date(Date.now() - 86400000).toISOString(),
    paid_until: null,
    billing_alerted_for: null,
  };

  const r = await handleInbound({ ...input("do you ship to Oran?", "customer", expired), notify });
  assert.ok(r.ok && r.limited);
  assert.equal(r.handoff, "Subscription expired");
  assert.equal(calls.n, 0);
  assert.equal(tables.conversations[0].status, "human");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(sent.length, 1);
});

test("billing not enforced: an expired trial still gets model replies", async () => {
  const { input } = setup();
  const calls = { n: 0 };
  stubLlm("Oui, on livre à Oran.", calls);
  const expired = { trial_ends_at: new Date(Date.now() - 86400000).toISOString(), paid_until: null };
  const base = input("do you ship to Oran?", "customer", expired);
  const r = await handleInbound({ ...base, env: (k: string) => (k === "BILLING_ENFORCED" ? undefined : base.env(k)) });
  assert.ok(r.ok && !r.limited);
  assert.equal(calls.n, 1);
});

test("trial over but paid (within grace): the model still answers", async () => {
  const { input } = setup();
  const calls = { n: 0 };
  stubLlm("Oui, on livre à Oran.", calls);
  const paid = {
    trial_ends_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    paid_until: new Date(Date.now() - 86400000).toISOString(),
  };
  const r = await handleInbound(input("do you ship to Oran?", "customer", paid));
  assert.ok(r.ok && !r.limited);
  assert.equal(calls.n, 1);
});

test("a null token cap means unlimited: the model still runs", async () => {
  const runs = [
    {
      store_id: "s1",
      source: "customer",
      fast_path: false,
      error: null,
      created_at: new Date().toISOString(),
      input_tokens: 10_000_000,
      output_tokens: 0,
      _seq: 0,
    },
  ];
  const { input } = setup({ runs });
  const calls = { n: 0 };
  stubLlm("Yes.", calls);
  const r = await handleInbound(input("do you ship to Oran?", "customer", { ai_monthly_token_limit: null }));
  assert.ok(r.ok && !r.limited);
  assert.equal(calls.n, 1);
});

test("the limit notice is written in the customer's language", async () => {
  const now = new Date().toISOString();
  const runs = [0, 1].map((i) => ({ store_id: "s1", source: "customer", fast_path: false, error: null, created_at: now, _seq: i }));
  stubLlm("nope", { n: 0 });
  const ar = await handleInbound(setup({ runs: runs.map((r) => ({ ...r })) }).input("هل عندكم هودي أسود؟"));
  assert.ok(ar.ok && /[\u0600-\u06ff]/.test(ar.reply ?? ""));
  const fr = await handleInbound(setup({ runs: runs.map((r) => ({ ...r })) }).input("Bonjour, vous livrez à Oran ?"));
  assert.ok(fr.ok && /Merci pour votre message/.test(fr.reply ?? ""));
});

test("usage counts the distinct conversations behind this month's counted replies", async () => {
  const now = new Date("2026-10-15T12:00:00Z");
  const thisMonth = "2026-10-03T09:00:00Z";
  const row = (conversation_id: string, extra: Row = {}, created_at = thisMonth) =>
    ({ store_id: "s1", conversation_id, source: "customer", fast_path: false, error: null, created_at, ...extra });
  const tables = {
    agent_runs: [
      row("c1"),
      row("c1"),
      row("c2"),
      row("c3", { source: "test" }),
      row("c4", { fast_path: true }),
      row("c5", { error: "boom" }),
      row("c6", {}, "2026-09-30T23:00:00Z"),
      row("c7", { store_id: "s2" }),
    ].map((r, i) => ({ ...r, _seq: i })),
  };
  const usage = await getUsage(fakeDb(tables), "s1", 1000, now);
  assert.equal(usage.used, 3);
  assert.equal(usage.conversations, 2);
  assert.equal(usage.limit, 1000);

  const none = await getUsage(fakeDb({ agent_runs: [] }), "s1", 1000, now);
  assert.equal(none.conversations, 0);
  assert.equal(none.used, 0);
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

test("a photo goes to a vision model on the customer's last turn; a text-only model never sees it", async () => {
  const photoRow = { id: "m0", conversation_id: "c1", direction: "inbound", body: "[image]", _seq: 0,
    attachments: [{ type: "image", url: "https://scontent.cdninstagram.com/p.png" }] };
  const seenUrls: string[] = [];
  const llmBodies: { messages: { role: string; content: unknown }[] }[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    if (String(url).startsWith("https://scontent")) {
      seenUrls.push(String(url));
      return Promise.resolve(new Response(new Uint8Array([0x89, 0x50]).buffer, {
        status: 200,
        headers: { "content-type": "image/png" },
      }));
    }
    llmBodies.push(JSON.parse(String(init?.body)));
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "That hoodie is in our catalog." }, finish_reason: "stop" }],
      usage: { prompt_tokens: 1, completion_tokens: 1 },
    }), { status: 200 }));
  }) as typeof fetch;

  const visionEnv = (k: string) => (k === "LLM_VISION" ? "true" : env(k));
  const { input } = setup({ messages: [{ ...photoRow }] });
  const r = await handleInbound({ ...input("[image]"), inboundMessageId: "m0", env: visionEnv });
  assert.ok(r.ok);
  assert.deepEqual(seenUrls, ["https://scontent.cdninstagram.com/p.png"]);
  const last = llmBodies[0].messages.at(-1)!;
  assert.equal(last.role, "user");
  assert.ok(Array.isArray(last.content));
  assert.match(JSON.stringify(last.content), /"url":"data:image\/png;base64,/);

  // Same photo, text-only model: nothing is downloaded and the model gets plain text.
  const textOnly = setup({ messages: [{ ...photoRow }] });
  await handleInbound({ ...textOnly.input("[image]"), inboundMessageId: "m0", env });
  assert.equal(seenUrls.length, 1);
  assert.equal(llmBodies[1].messages.at(-1)!.content, "[image]");
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

test("when every provider fails a customer gets a holding reply and the chat goes to the owner", async () => {
  const { tables, input } = setup();
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  const r = await handleInbound(input("do you ship to Oran?"));
  assert.ok(r.ok && r.degraded && r.status === "human");
  assert.match(r.ok ? r.reply ?? "" : "", /owner/);
  assert.match(String(tables.conversations[0].handoff_reason), /unavailable/i);
  const run = tables.agent_runs[0];
  assert.match(String(run.error), /All model providers failed/);
  const sent = tables.messages.filter((m) => m.sender === "agent");
  assert.equal(sent.length, 1);
  assert.equal(sent[0].delivery_status, "pending");
});

test("the failure holding reply follows the customer's language", async () => {
  const { input } = setup();
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  const r = await handleInbound(input("هل عندكم هودي أسود؟"));
  assert.ok(r.ok && /[\u0600-\u06ff]/.test(r.reply ?? ""));
});

test("a test chat shows the outage instead of hiding it", async () => {
  const { tables, input } = setup();
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  const r = await handleInbound(input("do you ship to Oran?", "test"));
  assert.equal(r.ok, false);
  assert.equal(tables.messages.filter((m) => m.sender === "agent").length, 0);
  assert.equal(tables.conversations[0].status, "bot");
});

test("rapid-fire messages: only the newest of a burst is answered, once", async () => {
  const { tables, input } = setup();
  tables.messages.push({ id: "m2", conversation_id: "c1", direction: "inbound", body: "and the price?", _seq: 1 });
  const calls = { n: 0 };
  stubLlm("x", calls);
  const slept: number[] = [];
  const base = { debounceMs: 3000, sleep: (ms: number) => { slept.push(ms); return Promise.resolve(); } };
  // m1 is no longer the newest message, so it steps aside...
  const older = await handleInbound({ ...input("do you ship to Oran?"), ...base });
  assert.ok(older.ok && older.reply === null);
  assert.equal(calls.n, 0);
  // ...and m2 answers with the whole burst in its history.
  const newest = await handleInbound({ ...input("and the price?"), inboundMessageId: "m2", ...base });
  assert.ok(newest.ok && newest.reply === "x");
  assert.equal(calls.n, 1);
  assert.deepEqual(slept, [3000, 3000]);
});

test("a message that already has a reply is not answered twice (webhook redelivery)", async () => {
  const { input } = setup({
    runs: [{ store_id: "s1", trigger_message_id: "m1", source: "customer", fast_path: false, error: null, _seq: 0 }],
  });
  const calls = { n: 0 };
  stubLlm("x", calls);
  const r = await handleInbound(input("do you ship to Oran?"));
  assert.ok(r.ok && r.reply === null && /already/i.test(r.note ?? ""));
  assert.equal(calls.n, 0);
});

test("a second message waits for the first reply to finish, then is answered", async () => {
  const { tables, input } = setup();
  tables.messages.push({ id: "m2", conversation_id: "c1", direction: "inbound", body: "and the price?", _seq: 1 });
  locks.add("c1"); // another run is mid-reply
  const calls = { n: 0 };
  stubLlm("It's 4500 DA.", calls);
  let polls = 0;
  const sleep = () => {
    if (++polls === 2) locks.delete("c1"); // the other run finishes
    return Promise.resolve();
  };
  const r = await handleInbound({ ...input("and the price?"), inboundMessageId: "m2", sleep });
  assert.ok(r.ok && r.reply === "It's 4500 DA.");
  assert.equal(polls, 2);
  assert.equal(locks.size, 0, "the lock is released afterwards");
});

test("if the chat stays busy the message is left for the run that holds it", async () => {
  const { input } = setup();
  locks.add("c1");
  const calls = { n: 0 };
  stubLlm("x", calls);
  const r = await handleInbound({ ...input("do you ship to Oran?"), lockWaitMs: 3000, sleep: () => Promise.resolve() });
  assert.ok(r.ok && r.reply === null && /in progress/i.test(r.note ?? ""));
  assert.equal(calls.n, 0);
  assert.ok(locks.has("c1"), "the other run's lock is untouched");
});

test("the lock is released even when the model fails", async () => {
  const { input } = setup();
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  await handleInbound(input("do you ship to Oran?"));
  assert.equal(locks.size, 0);
  assert.deepEqual(rpcCalls, ["claim_conversation", "release_conversation"]);
});

test("if the owner takes over while we wait, the assistant stays silent", async () => {
  const { tables, input } = setup();
  locks.add("c1");
  const calls = { n: 0 };
  stubLlm("x", calls);
  const sleep = () => {
    tables.conversations[0].status = "human"; // owner replies meanwhile
    locks.delete("c1");
    return Promise.resolve();
  };
  const r = await handleInbound({ ...input("do you ship to Oran?"), sleep });
  assert.ok(r.ok && r.reply === null && r.status === "human");
  assert.equal(calls.n, 0);
});

// Owner alerts run after the reply is stored, in the background: let them settle before asserting.
const settle = () => new Promise<void>((r) => setTimeout(r, 20));

test("a handoff to the owner alerts the owner once, after the reply is stored", async () => {
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
  const alerts: { storeId: string; text: string }[] = [];
  const r = await handleInbound({
    ...input("can I get 20% off?"),
    notify: (storeId: string, text: string) => {
      alerts.push({ storeId, text });
      return Promise.resolve(true);
    },
  });
  assert.ok(r.ok && r.status === "human");
  assert.equal(tables.messages.filter((m) => m.sender === "agent").length, 1, "reply stored");
  await settle();
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].storeId, "s1");
  assert.match(alerts[0].text, /Demo Boutique/);
  assert.match(alerts[0].text, /wants a discount/);
});

test("a playground chat never alerts the owner, even when it hands off", async () => {
  const { input } = setup();
  let call = 0;
  globalThis.fetch = (() => {
    call++;
    const message = call === 1
      ? {
        content: null,
        tool_calls: [{ id: "t1", type: "function", function: { name: "handoff_to_owner", arguments: '{"reason":"test"}' } }],
      }
      : { content: "ok" };
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }], usage: {} }), { status: 200 }));
  }) as typeof fetch;
  let alerts = 0;
  await handleInbound({
    ...input("can I get 20% off?", "test"),
    notify: () => {
      alerts++;
      return Promise.resolve(true);
    },
  });
  await settle();
  assert.equal(alerts, 0);
});

test("an owner alert that fails does not change the customer's reply", async () => {
  const { tables, input } = setup();
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  const r = await handleInbound({
    ...input("do you ship to Oran?"),
    notify: () => Promise.reject(new Error("telegram down")),
  });
  assert.ok(r.ok && r.degraded);
  await settle();
  assert.equal(tables.messages.filter((m) => m.sender === "agent").length, 1);
});

// --- Reply credits ----------------------------------------------------------------------------

// Two customer replies this month: the included allowance (monthly_reply_limit 2) is spent.
const spentAllowance = (extra: Row = {}) =>
  [0, 1].map((i) => ({
    store_id: "s1",
    source: "customer",
    fast_path: false,
    error: null,
    created_at: new Date().toISOString(),
    _seq: i,
    ...extra,
  }));

const creditCalls = () => rpcCalls.filter((name) => name.includes("credit"));

// The store row the RPCs act on, and the settings the pipeline reads (the same balance).
function withCredits(tables: Record<string, Row[]>, credits: number): Partial<StoreSettings> {
  tables.stores = [{ id: "s1", reply_credits: credits, _seq: 0 }];
  return { reply_credits: credits };
}

test("limit hit with credits: the reply is sent, one credit is spent, the run is marked used_credit", async () => {
  const { tables, input } = setup({ runs: spentAllowance() });
  const credits = withCredits(tables, 1);
  const calls = { n: 0 };
  stubLlm("Yes, we ship to Oran.", calls);
  const r = await handleInbound(input("do you ship to Oran?", "customer", credits));
  assert.ok(r.ok && !r.limited && r.reply === "Yes, we ship to Oran.");
  assert.equal(calls.n, 1);
  assert.equal(tables.stores[0].reply_credits, 0);
  const run = tables.agent_runs.at(-1);
  assert.equal(run?.used_credit, true);
  assert.equal(run?.error, null);
  assert.deepEqual(creditCalls(), ["consume_reply_credit"]);
});

test("limit hit with no credits: the hand-off happens as before and no credit is touched", async () => {
  const { tables, input } = setup({ runs: spentAllowance() });
  const credits = withCredits(tables, 0);
  const calls = { n: 0 };
  stubLlm("nope", calls);
  const r = await handleInbound(input("do you ship to Oran?", "customer", credits));
  assert.ok(r.ok && r.limited && /limit/i.test(String(r.handoff)));
  assert.equal(calls.n, 0);
  assert.equal(tables.stores[0].reply_credits, 0);
  assert.deepEqual(creditCalls(), []);
});

test("a credit spent on a reply that then fails is refunded", async () => {
  const { tables, input } = setup({ runs: spentAllowance() });
  const credits = withCredits(tables, 1);
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  const r = await handleInbound(input("do you ship to Oran?", "customer", credits));
  assert.ok(r.ok && r.degraded);
  assert.equal(tables.stores[0].reply_credits, 1, "balance restored");
  assert.deepEqual(creditCalls(), ["consume_reply_credit", "add_reply_credits"]);
  assert.equal(tables.agent_runs.filter((run) => run.used_credit === true && !run.error).length, 0);
});

test("the credit rpc fails: the limit hand-off, no model call and no free reply", async () => {
  const { tables, input } = setup({ runs: spentAllowance() });
  const credits = withCredits(tables, 1);
  creditRpcError = true;
  const calls = { n: 0 };
  stubLlm("nope", calls);
  const r = await handleInbound(input("do you ship to Oran?", "customer", credits));
  assert.ok(r.ok && r.limited && /limit/i.test(String(r.handoff)));
  assert.equal(calls.n, 0);
  assert.equal(tables.stores[0].reply_credits, 1);
  assert.equal(tables.conversations[0].status, "human");
});

test("the token cap still blocks a credit reply: no credit spent", async () => {
  const runs = [
    ...spentAllowance({ input_tokens: 60, output_tokens: 60 }),
  ];
  const { tables, input } = setup({ runs });
  const credits = withCredits(tables, 1);
  const calls = { n: 0 };
  stubLlm("nope", calls);
  const r = await handleInbound({ ...input("do you ship to Oran?", "customer", { ...credits, ai_monthly_token_limit: 100 }), notify: () => Promise.resolve(true) });
  assert.ok(r.ok && r.limited);
  assert.match(String(r.ok ? r.handoff : ""), /token cap/i);
  assert.equal(calls.n, 0);
  assert.equal(tables.stores[0].reply_credits, 1, "balance unchanged");
  assert.ok(!rpcCalls.includes("consume_reply_credit"));
});

test("credit-paid replies don't count toward the token cap, but still count as replies", async () => {
  const runs = spentAllowance({ used_credit: true, input_tokens: 90, output_tokens: 10 });
  const { tables, input } = setup({ runs });
  const credits = withCredits(tables, 1);
  const usage = await getUsage(fakeDb(tables), "s1", 2, new Date(), 100);
  assert.equal(usage.used, 2);
  assert.equal(usage.exceeded, true);
  assert.equal(usage.tokens.used, 0);
  assert.equal(usage.tokens.exceeded, false);

  const calls = { n: 0 };
  stubLlm("Oui, on livre à Oran.", calls);
  const r = await handleInbound(input("do you ship to Oran?", "customer", { ...credits, ai_monthly_token_limit: 100 }));
  assert.ok(r.ok && !r.limited && r.reply === "Oui, on livre à Oran.");
  assert.equal(calls.n, 1);
  assert.equal(tables.stores[0].reply_credits, 0);
});

// Fake provider: replies in order and records each request body.
function stubSequence(replies: Record<string, unknown>[]) {
  const bodies: any[] = [];
  globalThis.fetch = (async (_url: string, init: { body: string }) => {
    bodies.push(JSON.parse(init.body));
    const message = replies.shift();
    if (!message) throw new Error("fake provider: script exhausted");
    return new Response(
      JSON.stringify({ choices: [{ message, finish_reason: "stop" }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      { status: 200 },
    );
  }) as typeof fetch;
  return bodies;
}

test("a later turn's prompt carries the variant id from an earlier search", async () => {
  const { input } = setup({
    runs: [{
      id: "run-old",
      _seq: 0,
      store_id: "s1",
      conversation_id: "c1",
      source: "customer",
      fast_path: false,
      error: null,
      tool_calls: [
        { name: "search_products", input: { query: "hoodie" }, is_error: false, output: "Black Hoodie 4,500.00 DA: M variant_id v-123, in_stock" },
        { name: "search_products", input: { query: "broken" }, is_error: true, error: "db down" },
      ],
    }, {
      id: "run-failed",
      _seq: 1,
      store_id: "s1",
      conversation_id: "c1",
      source: "customer",
      fast_path: false,
      error: "500: boom",
      tool_calls: [{ name: "check_stock", input: {}, is_error: false, output: "Other 1 DA: X variant_id v-999, in_stock" }],
    }],
  });
  const bodies = stubSequence([{ content: "Hoodie noir taille M: 4 500 DA. Ça marche ?" }]);
  const r = await handleInbound(input("Ahmed, 0550 12 34 56, Oran"));
  assert.ok(r.ok && r.reply);
  const system = bodies[0].messages[0].content as string;
  assert.match(system, /Facts from your earlier lookups in this chat/);
  assert.match(system, /variant_id v-123/);
  assert.doesNotMatch(system, /v-999/); // runs that failed don't leave facts behind
});

test("the order rules are in the prompt when orders are on", async () => {
  const { input } = setup();
  const bodies = stubSequence([{ content: "Merci, quel est votre nom ?" }]);
  await handleInbound(input("je veux commander", "customer", { orders_enabled: true }));
  const system = bodies[0].messages[0].content as string;
  assert.match(system, /Collecting the order details is YOUR job, not the owner's/);
  assert.match(system, /Never hand off because details are missing, partial or invalid: ask for them/);
});

const dzMessages = () => [{ id: "m1", conversation_id: "c1", direction: "inbound", body: "wach kayen hoodie noir taille M?", _seq: 0 }];

test("a Darija reply with Arabic script gets one Latin rewrite request, which is used", async () => {
  const { input } = setup({ messages: dzMessages() });
  const bodies = stubSequence([
    { content: "Hoodie noir 3500 DA، تقدر تكمل" },
    { content: "Hoodie noir 3500 DA, tqdar tkmel." },
  ]);
  const r = await handleInbound(input("wach kayen hoodie noir taille M?"));
  assert.ok(r.ok && r.reply === "Hoodie noir 3500 DA, tqdar tkmel.");
  assert.equal(bodies.length, 2);
  assert.equal(bodies[1].tools, undefined); // the rewrite is plain text only
  assert.match(bodies[1].messages[0].content, /Latin letters/);
});

test("when the Latin rewrite still has Arabic script, the script check retries once and sends the clean retry", async () => {
  const { input } = setup({ messages: dzMessages() });
  const bodies = stubSequence([
    { content: "Hoodie noir 3500 DA، تقدر تكمل" }, // model reply
    { content: "Hoodie noir 3500 DA، كاينة" }, // Latin rewrite, still Arabic: the original is kept
    { content: "Hoodie noir 3500 DA, kayna." }, // script-check retry
  ]);
  const r = await handleInbound(input("wach kayen hoodie noir taille M?"));
  assert.ok(r.ok && r.reply === "Hoodie noir 3500 DA, kayna.");
  assert.equal(bodies.length, 3);
  assert.match(bodies[2].messages.at(-1).content, /Arabic-script letters/);
});

test("a clean Darija reply needs no rewrite, and a non-Darija reply is never rewritten", async () => {
  // The stored history ends with the customer's Darija message, as it does in production.
  const { input } = setup({ messages: dzMessages() });
  const clean = stubSequence([{ content: "Hoodie noir 3500 DA, kayna. Bghiti tcommandi?" }]);
  await handleInbound(input("wach kayen hoodie noir taille M?"));
  assert.equal(clean.length, 1); // no rewrite request: the clean reply is sent as it is
  const { input: input2 } = setup({ messages: [{ id: "m1", conversation_id: "c1", direction: "inbound", body: "واش كاين هودي أسود؟", _seq: 0 }] });
  const arabic = stubSequence([{ content: "هوديي أسود 3500 دج" }]);
  const r = await handleInbound(input2("واش كاين هودي أسود؟"));
  assert.ok(r.ok && r.reply === "هوديي أسود 3500 دج");
  assert.equal(arabic.length, 1);
});

// A model that answers with one handoff_to_owner call, then a short reply.
function stubHandoff(args: object) {
  let call = 0;
  globalThis.fetch = (() => {
    call++;
    const message = call === 1
      ? {
        content: null,
        tool_calls: [{ id: "t1", type: "function", function: { name: "handoff_to_owner", arguments: JSON.stringify(args) } }],
      }
      : { content: "The owner will reply to you personally." };
    return Promise.resolve(new Response(JSON.stringify({ choices: [{ message, finish_reason: "stop" }], usage: {} }), { status: 200 }));
  }) as typeof fetch;
}

test("a handoff stores the owner summary and the alert shows it, cut to 300 characters", async () => {
  const { tables, input } = setup();
  const summary = "x".repeat(350);
  stubHandoff({ reason: "wants a discount", summary });
  const alerts: string[] = [];
  const r = await handleInbound({
    ...input("can I get 20% off?"),
    notify: (_storeId: string, text: string) => {
      alerts.push(text);
      return Promise.resolve(true);
    },
  });
  assert.ok(r.ok && r.status === "human");
  assert.equal(tables.conversations[0].handoff_summary, summary);
  await settle();
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /wants a discount/);
  assert.ok(alerts[0].includes("x".repeat(300)));
  assert.ok(!alerts[0].includes("x".repeat(301)));
  assert.match(alerts[0], /Demo Boutique/);
});

test("a handoff without a summary stores null and the alert has no summary line", async () => {
  const { tables, input } = setup();
  stubHandoff({ reason: "wants a discount" });
  const alerts: string[] = [];
  await handleInbound({
    ...input("can I get 20% off?"),
    notify: (_storeId: string, text: string) => {
      alerts.push(text);
      return Promise.resolve(true);
    },
  });
  assert.equal(tables.conversations[0].handoff_summary, null);
  await settle();
  assert.equal(alerts.length, 1);
  assert.doesNotMatch(alerts[0], /undefined|null/);
});

test("the monthly limit hand-off clears a stale owner summary", async () => {
  const runs = [0, 1].map((i) => ({ store_id: "s1", source: "customer", fast_path: false, error: null, created_at: new Date().toISOString(), _seq: i }));
  const { tables, input } = setup({ runs });
  tables.conversations[0].handoff_summary = "Old summary";
  stubLlm("nope", { n: 0 });
  await handleInbound(input("do you ship to Oran?"));
  assert.equal(tables.conversations[0].handoff_summary, null);
});

test("the token cap hand-off clears a stale owner summary", async () => {
  const runs = [{ store_id: "s1", source: "customer", fast_path: false, error: null, created_at: new Date().toISOString(), input_tokens: 90, output_tokens: 10, _seq: 0 }];
  const { tables, input } = setup({ runs });
  tables.conversations[0].handoff_summary = "Old summary";
  stubLlm("nope", { n: 0 });
  await handleInbound(input("do you ship to Oran?", "customer", { ai_monthly_token_limit: 100 }));
  assert.equal(tables.conversations[0].handoff_summary, null);
});

test("the subscription hand-off clears a stale owner summary", async () => {
  const { tables, input } = setup();
  tables.conversations[0].handoff_summary = "Old summary";
  stubLlm("nope", { n: 0 });
  const expired = { trial_ends_at: new Date(Date.now() - 86400000).toISOString(), paid_until: null, billing_alerted_for: null };
  await handleInbound(input("do you ship to Oran?", "customer", expired));
  assert.equal(tables.conversations[0].handoff_summary, null);
});

test("the degraded hand-off clears a stale owner summary", async () => {
  const { tables, input } = setup();
  tables.conversations[0].handoff_summary = "Old summary";
  globalThis.fetch = (() => Promise.resolve(new Response("down", { status: 500 }))) as typeof fetch;
  await handleInbound(input("do you ship to Oran?"));
  assert.equal(tables.conversations[0].handoff_summary, null);
});

// --- Product photos ----------------------------------------------------------

const PHOTO_BASE = "https://proj.supabase.co";
const hoodiePhoto = `${PHOTO_BASE}/storage/v1/object/public/product-images/s1/hoodie.jpg`;
const photoEnv = (k: string) => (k === "SUPABASE_URL" ? PHOTO_BASE : env(k));
const hoodieProduct: Row = {
  id: "p1",
  _seq: 0,
  store_id: "s1",
  name: "Black Hoodie",
  description: null,
  price_cents: 450000,
  active: true,
  image_url: hoodiePhoto,
  product_variants: [],
};
const photoCall = (args: object) => ({
  content: null,
  tool_calls: [{
    id: "c1",
    type: "function",
    function: { name: "send_product_photo", arguments: JSON.stringify(args) },
  }],
});

test("a queued product photo is stored after the text reply, as its own outbound row", async () => {
  const { tables, input } = setup();
  tables.products = [hoodieProduct];
  const bodies = stubSequence([photoCall({ product_name: "Black Hoodie" }), { content: "Voici le hoodie noir." }]);
  const r = await handleInbound({ ...input("wach kayen hoodie noir?"), env: photoEnv });
  assert.ok(r.ok);
  assert.deepEqual(r.ok && r.photos, [{ url: hoodiePhoto, name: "Black Hoodie" }]);
  assert.equal(bodies.length, 2);

  const outbound = tables.messages.filter((m) => m.direction === "outbound");
  assert.equal(outbound.length, 2);
  assert.equal(outbound[0].body, "Voici le hoodie noir.");
  assert.equal(outbound[0].delivery_status, "pending");
  assert.equal(outbound[1].body, null);
  assert.deepEqual(outbound[1].attachments, [{ type: "image", url: hoodiePhoto, caption: "Black Hoodie" }]);
  assert.equal(outbound[1].delivery_status, "pending");
  assert.equal(outbound[1].sender, "agent");
});

test("a photo already sent in the chat is refused, and the model is told so", async () => {
  const { tables, input } = setup({
    messages: [
      {
        id: "old-photo",
        conversation_id: "c1",
        direction: "outbound",
        sender: "agent",
        body: null,
        attachments: [{ type: "image", url: hoodiePhoto, caption: "Black Hoodie" }],
        delivery_status: "sent",
        _seq: 0,
      },
      { id: "m1", conversation_id: "c1", direction: "inbound", body: "encore la photo ?", _seq: 1 },
    ],
  });
  tables.products = [hoodieProduct];
  const bodies = stubSequence([photoCall({ product_name: "Black Hoodie" }), { content: "Je l'ai deja envoyee." }]);
  const r = await handleInbound({ ...input("encore la photo ?"), env: photoEnv });
  assert.ok(r.ok && r.photos === undefined);
  const toolResult = bodies[1].messages.at(-1);
  assert.equal(toolResult.role, "tool");
  assert.match(toolResult.content, /already sent/);
  assert.equal(tables.messages.filter((m) => m.body === null).length, 1);
});

test("a sent photo stays in the history as a bracketed note, not dropped", async () => {
  const { tables, input } = setup({
    messages: [
      { id: "m0", conversation_id: "c1", direction: "inbound", body: "wach kayen hoodie?", _seq: 0 },
      {
        id: "p0",
        conversation_id: "c1",
        direction: "outbound",
        sender: "agent",
        body: null,
        attachments: [{ type: "image", url: hoodiePhoto, caption: "Black Hoodie" }],
        delivery_status: "sent",
        _seq: 1,
      },
      { id: "m1", conversation_id: "c1", direction: "inbound", body: "merci, et le prix ?", _seq: 2 },
    ],
  });
  const bodies = stubSequence([{ content: "Le prix est 4 500 DA." }]);
  await handleInbound(input("merci, et le prix ?"));
  const turns = bodies[0].messages.slice(1) as { role: string; content: string }[];
  assert.ok(turns.some((t) => t.role === "assistant" && t.content === "[sent a photo of Black Hoodie]"));
  assert.equal(turns.at(-1)?.role, "user");
  assert.equal(tables.messages.length, 4);
});
