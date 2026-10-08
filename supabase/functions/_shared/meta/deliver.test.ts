import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { decryptSecret, encryptSecret } from "./crypto.ts";
import { deliverPending } from "./deliver.ts";
import { memDb, type Row, type Tables } from "../testing/memdb.ts";

const KEY = Buffer.alloc(32, 3).toString("base64");
const NOW = new Date("2026-10-05T12:00:00Z");
const env = (k: string) => ({ CREDENTIALS_ENCRYPTION_KEY: KEY } as Record<string, string>)[k];

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Sent = { url: string; auth: string | null; body: Record<string, unknown> };
function stubInstagram(respond?: (n: number) => Response): Sent[] {
  const sent: Sent[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    if (String(url).includes("refresh_access_token")) {
      return Promise.resolve(new Response(JSON.stringify({ access_token: "refreshed-token", expires_in: 5184000 })));
    }
    sent.push({ url: String(url), auth: headers.authorization ?? null, body: init?.body ? JSON.parse(String(init.body)) : {} });
    return Promise.resolve(respond ? respond(sent.length) : new Response(JSON.stringify({ message_id: `mid.${sent.length}` })));
  }) as typeof fetch;
  return sent;
}

async function setup(over: { messages?: Row[]; lastCustomerAt?: string; channel?: Row; expires?: string | null } = {}) {
  const tables: Tables = {
    messages: over.messages ?? [
      { id: "m1", conversation_id: "c1", direction: "outbound", sender: "agent", body: "Yes, it is in stock.", delivery_status: "pending", delivery_claimed_at: null },
    ],
    conversations: [{ id: "c1", channel_id: "ch1", customer_id: "u1", last_customer_message_at: over.lastCustomerAt ?? "2026-10-05T11:00:00Z" }],
    channels: [{ id: "ch1", platform: "instagram", status: "active", ...over.channel }],
    customers: [{ id: "u1", platform_user_id: "igsid-1" }],
    channel_credentials: [{
      channel_id: "ch1",
      access_token_encrypted: await encryptSecret("good-token", KEY),
      token_expires_at: over.expires === undefined ? "2026-12-01T00:00:00Z" : over.expires,
    }],
  };
  return { tables, db: memDb(tables) };
}

test("a pending reply is sent to the customer with the store's token and marked sent", async () => {
  const sent = stubInstagram();
  const { tables, db } = await setup();
  const r = await deliverPending({ db, env, now: NOW }, "c1");
  assert.deepEqual(r, { sent: 1, failed: 0, skipped: 0 });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].auth, "Bearer good-token");
  assert.deepEqual(sent[0].body, { recipient: { id: "igsid-1" }, message: { text: "Yes, it is in stock." } });
  assert.equal(tables.messages[0].delivery_status, "sent");
  assert.equal(tables.messages[0].platform_message_id, "mid.1");
});

test("two deliveries at once send the reply only once", async () => {
  const sent = stubInstagram();
  const { tables, db } = await setup();
  const [a, b] = await Promise.all([
    deliverPending({ db, env, now: NOW }, "c1"),
    deliverPending({ db, env, now: NOW }, "c1"),
  ]);
  assert.equal(sent.length, 1);
  assert.equal(a.sent + b.sent, 1);
  assert.equal(tables.messages[0].delivery_status, "sent");
});

test("a message already sent or already claimed is left alone", async () => {
  const sent = stubInstagram();
  const { db } = await setup({
    messages: [
      { id: "m1", conversation_id: "c1", direction: "outbound", body: "a", delivery_status: "sent", delivery_claimed_at: null },
      { id: "m2", conversation_id: "c1", direction: "outbound", body: "b", delivery_status: "pending", delivery_claimed_at: "2026-10-05T11:59:00Z" },
      { id: "m3", conversation_id: "c1", direction: "inbound", body: "c", delivery_status: "pending", delivery_claimed_at: null },
    ],
  });
  assert.deepEqual(await deliverPending({ db, env, now: NOW }, "c1"), { sent: 0, failed: 0, skipped: 0 });
  assert.equal(sent.length, 0);
});

test("a reply claimed moments ago by a live delivery is skipped", async () => {
  const sent = stubInstagram();
  const { tables, db } = await setup({
    messages: [
      { id: "m1", conversation_id: "c1", direction: "outbound", body: "a", delivery_status: "pending", delivery_claimed_at: "2026-10-05T11:59:30Z" },
    ],
  });
  assert.deepEqual(await deliverPending({ db, env, now: NOW }, "c1"), { sent: 0, failed: 0, skipped: 0 });
  assert.equal(sent.length, 0);
  assert.equal(tables.messages[0].delivery_status, "pending");
});

test("a claim left behind by a killed delivery is reclaimed and the reply is sent", async () => {
  const sent = stubInstagram();
  const { tables, db } = await setup({
    messages: [
      { id: "m1", conversation_id: "c1", direction: "outbound", body: "Yes, it is in stock.", delivery_status: "pending", delivery_claimed_at: "2026-10-05T11:50:00Z" },
    ],
  });
  const r = await deliverPending({ db, env, now: NOW }, "c1");
  assert.deepEqual(r, { sent: 1, failed: 0, skipped: 0 });
  assert.equal(sent.length, 1);
  assert.equal(tables.messages[0].delivery_status, "sent");
});

test("after 24 hours the reply is not sent and the owner is told why", async () => {
  const sent = stubInstagram();
  const { tables, db } = await setup({ lastCustomerAt: "2026-10-04T11:00:00Z" });
  const r = await deliverPending({ db, env, now: NOW }, "c1");
  assert.equal(r.failed, 1);
  assert.equal(sent.length, 0);
  assert.equal(tables.messages[0].delivery_status, "failed");
  assert.match(String(tables.messages[0].delivery_error), /24 hours/);
});

test("an expired token fails the message and marks the channel disconnected", async () => {
  stubInstagram(() => new Response(JSON.stringify({ error: { message: "Invalid OAuth access token", code: 190 } }), { status: 400 }));
  const { tables, db } = await setup();
  const r = await deliverPending({ db, env, now: NOW }, "c1");
  assert.equal(r.failed, 1);
  assert.match(String(tables.messages[0].delivery_error), /Connect Instagram again/);
  assert.equal(tables.channels[0].status, "disconnected");
});

test("a closed messaging window reported by Instagram is explained", async () => {
  stubInstagram(() => new Response(JSON.stringify({ error: { message: "x", code: 1545041 } }), { status: 400 }));
  const { tables, db } = await setup();
  await deliverPending({ db, env, now: NOW }, "c1");
  assert.match(String(tables.messages[0].delivery_error), /24 hours/);
  assert.equal(tables.channels[0].status, "active"); // the connection itself is fine
});

test("a network failure is recorded as a failure, not a crash", async () => {
  globalThis.fetch = (() => Promise.reject(new TypeError("fetch failed"))) as typeof fetch;
  const { tables, db } = await setup();
  const r = await deliverPending({ db, env, now: NOW }, "c1");
  assert.equal(r.failed, 1);
  assert.equal(tables.messages[0].delivery_status, "failed");
});

test("a long Arabic reply from the owner goes out in several messages that fit the limit", async () => {
  const sent = stubInstagram();
  const body = Array.from({ length: 60 }, () => "مرحبا بكم في متجرنا").join(" ");
  const { tables, db } = await setup({
    messages: [{ id: "m1", conversation_id: "c1", direction: "outbound", sender: "owner", body, delivery_status: "pending", delivery_claimed_at: null }],
  });
  const r = await deliverPending({ db, env, now: NOW }, "c1");
  assert.equal(r.sent, 1);
  assert.ok(sent.length > 1);
  assert.ok(sent.every((s) => new TextEncoder().encode(String((s.body.message as Row).text)).length <= 950));
  assert.equal(tables.messages[0].delivery_status, "sent");
});

test("replies go out in the order they were written", async () => {
  const sent = stubInstagram();
  const { db } = await setup({
    messages: [
      { id: "m1", conversation_id: "c1", direction: "outbound", body: "first", delivery_status: "pending", delivery_claimed_at: null },
      { id: "m2", conversation_id: "c1", direction: "outbound", body: "second", delivery_status: "pending", delivery_claimed_at: null },
    ],
  });
  await deliverPending({ db, env, now: NOW }, "c1");
  assert.deepEqual(sent.map((s) => (s.body.message as Row).text), ["first", "second"]);
});

test("a disconnected channel, a test chat and a missing token never reach Instagram", async () => {
  const sent = stubInstagram();
  let s = await setup({ channel: { status: "disconnected" } });
  assert.equal((await deliverPending({ db: s.db, env, now: NOW }, "c1")).failed, 1);
  assert.match(String(s.tables.messages[0].delivery_error), /disconnected/);

  s = await setup({ channel: { platform: "playground" } });
  assert.equal((await deliverPending({ db: s.db, env, now: NOW }, "c1")).skipped, 1);
  assert.equal(s.tables.messages[0].delivery_status, "skipped");

  s = await setup();
  s.tables.channel_credentials.length = 0;
  assert.equal((await deliverPending({ db: s.db, env, now: NOW }, "c1")).failed, 1);
  assert.equal(sent.length, 0);
});

test("a token in its last days is refreshed and stored encrypted; the new one is used", async () => {
  const sent = stubInstagram();
  const { tables, db } = await setup({ expires: "2026-10-10T00:00:00Z" });
  await deliverPending({ db, env, now: NOW }, "c1");
  assert.equal(sent[0].auth, "Bearer refreshed-token");
  const cred = tables.channel_credentials[0];
  assert.equal(await decryptSecret(String(cred.access_token_encrypted), KEY), "refreshed-token");
  assert.equal(new Date(String(cred.token_expires_at)).getTime(), NOW.getTime() + 5184000 * 1000);
});

test("a token far from expiry is not refreshed; a failed refresh still sends with the old token", async () => {
  let sent = stubInstagram();
  let s = await setup();
  await deliverPending({ db: s.db, env, now: NOW }, "c1");
  assert.equal(sent[0].auth, "Bearer good-token");

  sent = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    if (String(url).includes("refresh_access_token")) return Promise.resolve(new Response("{}", { status: 400 }));
    sent.push({ url: String(url), auth: (init?.headers as Record<string, string>).authorization, body: {} });
    return Promise.resolve(new Response(JSON.stringify({ message_id: "m" })));
  }) as typeof fetch;
  s = await setup({ expires: "2026-10-10T00:00:00Z" });
  const r = await deliverPending({ db: s.db, env, now: NOW }, "c1");
  assert.equal(r.sent, 1);
  assert.equal(sent[0].auth, "Bearer good-token");
});

test("an Instagram server error (5xx) is retried once; a client error is not", async () => {
  const sent = stubInstagram((n) => n === 1
    ? new Response(JSON.stringify({ error: { message: "temporarily unavailable", code: 2 } }), { status: 503 })
    : new Response(JSON.stringify({ message_id: "mid.ok" })));
  let s = await setup();
  const r = await deliverPending({ db: s.db, env, now: NOW }, "c1");
  assert.equal(r.sent, 1);
  assert.equal(sent.length, 2);
  assert.equal(s.tables.messages[0].platform_message_id, "mid.ok");

  const refused = stubInstagram(() => new Response(JSON.stringify({ error: { message: "bad recipient", code: 100 } }), { status: 400 }));
  s = await setup();
  assert.equal((await deliverPending({ db: s.db, env, now: NOW }, "c1")).failed, 1);
  assert.equal(refused.length, 1);
});
