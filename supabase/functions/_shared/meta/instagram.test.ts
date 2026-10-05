import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  buildAuthorizeUrl,
  exchangeCode,
  getProfile,
  MetaApiError,
  refreshLongLived,
  sendText,
  splitForInstagram,
  subscribeToMessages,
  toLongLived,
} from "./instagram.ts";

const cfg = { appId: "123", appSecret: "shh", redirectUri: "https://x.supabase.co/functions/v1/instagram-connect" };
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

type Call = { url: string; init?: RequestInit };
function stub(respond: (c: Call) => Response): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = ((url: string, init?: RequestInit) => {
    const c = { url: String(url), init };
    calls.push(c);
    return Promise.resolve(respond(c));
  }) as typeof fetch;
  return calls;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

test("the authorize URL asks only for messaging and basic access, with our state and redirect", () => {
  const u = new URL(buildAuthorizeUrl(cfg, "STATE"));
  assert.equal(u.origin + u.pathname, "https://www.instagram.com/oauth/authorize");
  assert.equal(u.searchParams.get("client_id"), "123");
  assert.equal(u.searchParams.get("redirect_uri"), cfg.redirectUri);
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("state"), "STATE");
  assert.equal(u.searchParams.get("scope"), "instagram_business_basic,instagram_business_manage_messages");
});

test("code exchange accepts the documented {data:[...]} shape and the flat one", async () => {
  stub(() => json({ data: [{ access_token: "short", user_id: "99", permissions: "x" }] }));
  assert.deepEqual(await exchangeCode(cfg, "code"), { accessToken: "short", userId: "99" });
  stub(() => json({ access_token: "short2", user_id: 7 }));
  assert.deepEqual(await exchangeCode(cfg, "code"), { accessToken: "short2", userId: "7" });
});

test("code exchange posts the secret server side and surfaces Instagram's error", async () => {
  const calls = stub(() => json({ error_type: "OAuthException", code: 400, error_message: "Matching code was not found or was already used" }, 400));
  await assert.rejects(exchangeCode(cfg, "code"), (e: unknown) => e instanceof MetaApiError && /already used/.test(e.message));
  assert.equal(calls[0].url, "https://api.instagram.com/oauth/access_token");
  assert.equal((calls[0].init!.body as FormData).get("client_secret"), "shh");
});

test("long-lived exchange and refresh compute the expiry", async () => {
  const now = new Date("2026-10-05T00:00:00Z");
  const calls = stub(() => json({ access_token: "long", token_type: "bearer", expires_in: 5183944 }));
  const t = await toLongLived(cfg, "short", now);
  assert.equal(t.accessToken, "long");
  assert.equal(t.expiresAt.getTime(), now.getTime() + 5183944 * 1000);
  assert.match(calls[0].url, /graph\.instagram\.com\/access_token\?.*grant_type=ig_exchange_token/);
  await refreshLongLived("long", now);
  assert.match(calls[1].url, /refresh_access_token\?.*grant_type=ig_refresh_token/);
});

test("profile gives the professional account id used in webhooks", async () => {
  const calls = stub(() => json({ user_id: "17841445084837990", username: "fennec_vision_", id: "app-scoped" }));
  const p = await getProfile("tok");
  assert.deepEqual(p, { accountId: "17841445084837990", username: "fennec_vision_", name: null });
  assert.equal((calls[0].init!.headers as Record<string, string>).authorization, "Bearer tok");
});

test("subscribing and sending use the account's token and the documented bodies", async () => {
  const calls = stub((c) => c.url.includes("subscribed_apps") ? json({ success: true }) : json({ recipient_id: "c1", message_id: "mid.1" }));
  await subscribeToMessages("tok");
  assert.match(calls[0].url, /\/me\/subscribed_apps\?subscribed_fields=messages$/);
  const sent = await sendText("tok", "cust-1", "Hello");
  assert.equal(sent.messageId, "mid.1");
  assert.match(calls[1].url, /graph\.instagram\.com\/v25\.0\/me\/messages$/);
  assert.deepEqual(JSON.parse(String(calls[1].init!.body)), { recipient: { id: "cust-1" }, message: { text: "Hello" } });
});

test("Graph errors keep their code so callers can tell an expired token from a closed window", async () => {
  stub(() => json({ error: { message: "Error validating access token", code: 190 } }, 400));
  await assert.rejects(sendText("tok", "c", "hi"), (e: unknown) => e instanceof MetaApiError && e.tokenInvalid && !e.windowClosed);
  stub(() => json({ error: { message: "outside window", code: 1545041 } }, 400));
  await assert.rejects(sendText("tok", "c", "hi"), (e: unknown) => e instanceof MetaApiError && e.windowClosed);
});

test("short replies are sent whole; long ones are split under the byte limit at natural breaks", () => {
  assert.deepEqual(splitForInstagram("  Salam, kayen  "), ["Salam, kayen"]);
  assert.deepEqual(splitForInstagram("   "), []);
  const bytes = (s: string) => new TextEncoder().encode(s).length;

  const english = Array.from({ length: 80 }, (_, i) => `This is sentence number ${i}.`).join(" ");
  const parts = splitForInstagram(english);
  assert.ok(parts.length > 1);
  assert.ok(parts.every((p) => bytes(p) <= 950));
  assert.ok(parts.slice(0, -1).every((p) => p.endsWith(".")), "breaks fall on sentence ends");
  assert.equal(parts.join(" "), english);

  // Arabic is two bytes a letter: 600 letters would be 1200 bytes.
  const arabic = Array.from({ length: 60 }, () => "مرحبا بكم في متجرنا").join(" ");
  const ar = splitForInstagram(arabic);
  assert.ok(ar.length > 1 && ar.every((p) => bytes(p) <= 950));
  assert.equal(ar.join(" "), arabic);

  // No spaces at all: still cut, never split an emoji in half.
  const solid = "😀".repeat(500);
  const hard = splitForInstagram(solid);
  assert.ok(hard.every((p) => bytes(p) <= 950));
  assert.equal(hard.join(""), solid);
});
