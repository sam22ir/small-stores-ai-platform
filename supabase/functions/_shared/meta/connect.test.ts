import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { completeInstagramConnect, disconnectChannel } from "./connect.ts";
import { decryptSecret } from "./crypto.ts";
import { signState } from "./state.ts";
import { memDb, type Tables } from "../testing/memdb.ts";

const KEY = Buffer.alloc(32, 5).toString("base64");
const cfg = { appId: "123", appSecret: "app-secret", redirectUri: "https://x.supabase.co/functions/v1/instagram-connect" };
const NOW = new Date("2026-10-05T12:00:00Z");

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubInstagram(over: { subscribeFails?: boolean; codeFails?: boolean } = {}) {
  const urls: string[] = [];
  globalThis.fetch = ((url: string) => {
    const u = String(url);
    urls.push(u);
    const json = (b: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(b), { status }));
    if (u.includes("api.instagram.com/oauth/access_token")) {
      return over.codeFails
        ? json({ error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }, 400)
        : json({ data: [{ access_token: "short-token", user_id: "app-scoped" }] });
    }
    if (u.includes("/access_token?")) return json({ access_token: "long-token", expires_in: 5183944 });
    if (u.includes("/me?fields")) return json({ user_id: "17841445084837990", username: "fennec_vision_" });
    if (u.includes("subscribed_apps")) return over.subscribeFails ? json({ error: { message: "nope", code: 10 } }, 400) : json({ success: true });
    return json({}, 404);
  }) as typeof fetch;
  return urls;
}

function setup() {
  const tables: Tables = {
    store_members: [
      { store_id: "s1", user_id: "owner-1", role: "owner" },
      { store_id: "s1", user_id: "staff-1", role: "staff" },
    ],
    channels: [], channel_credentials: [],
  };
  return { tables, deps: { db: memDb(tables), cfg, stateSecret: cfg.appSecret, encryptionKey: KEY, now: NOW } };
}

const stateFor = (user: string, store = "s1") => signState({ store_id: store, user_id: user }, cfg.appSecret, NOW.getTime());

test("connecting saves the account and its token encrypted, then subscribes to messages", async () => {
  const urls = stubInstagram();
  const { tables, deps } = setup();
  const r = await completeInstagramConnect(deps, { code: "abc", state: await stateFor("owner-1") });
  assert.ok(r.ok && !r.warning && r.username === "fennec_vision_");

  assert.equal(tables.channels.length, 1);
  assert.deepEqual(
    { store_id: tables.channels[0].store_id, platform: tables.channels[0].platform, external_id: tables.channels[0].external_id, display_name: tables.channels[0].display_name, status: tables.channels[0].status },
    { store_id: "s1", platform: "instagram", external_id: "17841445084837990", display_name: "@fennec_vision_", status: "active" },
  );
  const cred = tables.channel_credentials[0];
  assert.ok(!String(cred.access_token_encrypted).includes("long-token"));
  assert.equal(await decryptSecret(String(cred.access_token_encrypted), KEY), "long-token");
  assert.equal(cred.token_expires_at, new Date(NOW.getTime() + 5183944 * 1000).toISOString());
  assert.ok(urls.some((u) => u.includes("subscribed_apps")));
});

test("reconnecting the same account to the same store reactivates it", async () => {
  stubInstagram();
  const { tables, deps } = setup();
  await completeInstagramConnect(deps, { code: "a", state: await stateFor("owner-1") });
  tables.channels[0].status = "disconnected";
  const r = await completeInstagramConnect(deps, { code: "b", state: await stateFor("owner-1") });
  assert.ok(r.ok);
  assert.equal(tables.channels.length, 1);
  assert.equal(tables.channels[0].status, "active");
});

test("a forged, expired or missing state saves nothing", async () => {
  const urls = stubInstagram();
  const { tables, deps } = setup();
  const forged = await signState({ store_id: "s1", user_id: "owner-1" }, "attacker-secret", NOW.getTime());
  const old = await signState({ store_id: "s1", user_id: "owner-1" }, cfg.appSecret, NOW.getTime() - 3_600_000);
  for (const state of [forged, old, null, "junk"]) {
    assert.deepEqual(await completeInstagramConnect(deps, { code: "abc", state }), { ok: false, reason: "invalid_state" });
  }
  assert.equal(tables.channels.length, 0);
  assert.equal(urls.length, 0, "never even exchanged the code");
});

test("only an owner of the store can connect it", async () => {
  stubInstagram();
  const { tables, deps } = setup();
  assert.deepEqual(await completeInstagramConnect(deps, { code: "a", state: await stateFor("staff-1") }), { ok: false, reason: "not_owner" });
  assert.deepEqual(await completeInstagramConnect(deps, { code: "a", state: await stateFor("stranger") }), { ok: false, reason: "not_owner" });
  assert.equal(tables.channels.length, 0);
});

test("an Instagram account that belongs to another store can't be taken over", async () => {
  stubInstagram();
  const { tables, deps } = setup();
  tables.store_members.push({ store_id: "s2", user_id: "owner-2", role: "owner" });
  await completeInstagramConnect(deps, { code: "a", state: await stateFor("owner-1") });
  const r = await completeInstagramConnect(deps, { code: "b", state: await stateFor("owner-2", "s2") });
  assert.deepEqual(r, { ok: false, reason: "already_connected" });
  assert.equal(tables.channels[0].store_id, "s1");
});

test("cancelling on Instagram, or a rejected code, is reported without saving", async () => {
  const { tables, deps } = setup();
  stubInstagram();
  assert.deepEqual(await completeInstagramConnect(deps, { code: null, state: await stateFor("owner-1"), error: "access_denied" }), { ok: false, reason: "denied" });
  stubInstagram({ codeFails: true });
  assert.deepEqual(await completeInstagramConnect(deps, { code: "used", state: await stateFor("owner-1") }), { ok: false, reason: "instagram_error" });
  assert.equal(tables.channels.length, 0);
});

test("if turning on message delivery fails, the account is saved and the owner is warned", async () => {
  stubInstagram({ subscribeFails: true });
  const { tables, deps } = setup();
  const r = await completeInstagramConnect(deps, { code: "a", state: await stateFor("owner-1") });
  assert.ok(r.ok && r.warning === "subscribe_failed");
  assert.equal(tables.channels.length, 1);
});

test("disconnecting stops the channel, deletes its token and keeps the history", async () => {
  stubInstagram();
  const { tables, deps } = setup();
  const r = await completeInstagramConnect(deps, { code: "a", state: await stateFor("owner-1") });
  assert.ok(r.ok);
  const channelId = r.ok ? r.channelId : "";
  assert.equal(await disconnectChannel(deps.db, "other-store", channelId), false);
  assert.equal(tables.channels[0].status, "active");
  assert.equal(await disconnectChannel(deps.db, "s1", channelId), true);
  assert.equal(tables.channels[0].status, "disconnected");
  assert.equal(tables.channel_credentials.length, 0);
});

test("a trailing '#_' on the code is stripped before it is exchanged", async () => {
  stubInstagram();
  const bodies: string[] = [];
  const inner = globalThis.fetch;
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    if (String(url).includes("oauth/access_token")) bodies.push(String((init!.body as FormData).get("code")));
    return inner(url, init);
  }) as typeof fetch;
  const { deps } = setup();
  const r = await completeInstagramConnect(deps, { code: "AQBxyz#_", state: await stateFor("owner-1") });
  assert.ok(r.ok);
  assert.deepEqual(bodies, ["AQBxyz"]);
});

test("an unusable encryption key saves nothing: no half-connected account", async () => {
  stubInstagram();
  const { tables, deps } = setup();
  for (const encryptionKey of ["openssl rand -base64 32", "not base64!!", Buffer.alloc(16).toString("base64"), undefined]) {
    const r = await completeInstagramConnect({ ...deps, encryptionKey }, { code: "a", state: await stateFor("owner-1") });
    assert.deepEqual(r, { ok: false, reason: "server_error" });
  }
  assert.equal(tables.channels.length, 0);
  assert.equal(tables.channel_credentials.length, 0);
});
