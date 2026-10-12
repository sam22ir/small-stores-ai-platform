import assert from "node:assert/strict";
import { test } from "node:test";
import { parseWilayaFee, YalidineClient, YalidineError } from "./yalidine.ts";

const ok = (b: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers });

test("parseWilayaFee takes the most common commune price, lowest on a tie", () => {
  const item = {
    to_wilaya_id: 16,
    per_commune: { 1: { express_home: 600 }, 2: { express_home: 600 }, 3: { express_home: 900 } },
  };
  assert.deepEqual(parseWilayaFee(item, "home"), { toWilayaId: 16, feeDa: 600 });
  const tie = { to_wilaya_id: 5, per_commune: [{ express_home: 800 }, { express_home: 500 }] };
  assert.deepEqual(parseWilayaFee(tie, "home"), { toWilayaId: 5, feeDa: 500 });
});

test("parseWilayaFee reads the desk price and flat fields, ignores zero and junk", () => {
  assert.equal(parseWilayaFee({ to_wilaya_id: 1, per_commune: [{ express_home: 900, express_desk: 450 }] }, "desk")?.feeDa, 450);
  assert.equal(parseWilayaFee({ to_wilaya_id: 1, express_home: "700" }, "home")?.feeDa, 700);
  assert.equal(parseWilayaFee({ to_wilaya_id: 1, per_commune: [{ express_home: 0 }] }, "home"), null);
  assert.equal(parseWilayaFee({ per_commune: [{ express_home: 500 }] }, "home"), null);
  assert.equal(parseWilayaFee("nope", "home"), null);
});

test("client sends the auth headers and follows has_more", async () => {
  const seen: { url: string; headers: Record<string, string> }[] = [];
  const fetcher = ((url: URL, init: RequestInit) => {
    seen.push({ url: String(url), headers: init.headers as Record<string, string> });
    const page = Number(new URL(String(url)).searchParams.get("page"));
    return Promise.resolve(ok({ has_more: page < 2, data: [{ n: page }] }));
  }) as unknown as typeof fetch;
  const c = new YalidineClient({ id: "ID", token: "TOK" }, { fetch: fetcher });
  assert.deepEqual(await c.list("wilayas"), [{ n: 1 }, { n: 2 }]);
  assert.equal(seen[0].headers["X-API-ID"], "ID");
  assert.equal(seen[0].headers["X-API-TOKEN"], "TOK");
  assert.match(seen[0].url, /^https:\/\/api\.yalidine\.app\/v1\/wilayas\?/);
});

test("wilayaFees falls back to the second path on 404 but not on other errors", async () => {
  const paths: string[] = [];
  const fetcher = ((url: URL) => {
    const p = new URL(String(url)).pathname;
    paths.push(p);
    if (p.endsWith("/deliveryfees")) return Promise.resolve(ok({}, 404));
    return Promise.resolve(ok({ has_more: false, data: [{ to_wilaya_id: 16, per_commune: [{ express_home: 600 }] }] }));
  }) as unknown as typeof fetch;
  const fees = await new YalidineClient({ id: "a", token: "b" }, { fetch: fetcher }).wilayaFees(31, "home");
  assert.deepEqual(paths, ["/v1/deliveryfees", "/v1/fees"]);
  assert.equal(fees.get(16), 600);

  const boom = (() => Promise.resolve(ok({}, 500))) as unknown as typeof fetch;
  await assert.rejects(new YalidineClient({ id: "a", token: "b" }, { fetch: boom }).wilayaFees(31, "home"), (e: unknown) => e instanceof YalidineError && e.status === 500);
});

test("errors: 401 is bad credentials, 429 carries retry-after", async () => {
  const f401 = (() => Promise.resolve(ok({}, 401))) as unknown as typeof fetch;
  await assert.rejects(new YalidineClient({ id: "a", token: "b" }, { fetch: f401 }).testConnection(), { message: "bad_credentials" });
  const f429 = (() => Promise.resolve(ok({}, 429, { "retry-after": "12" }))) as unknown as typeof fetch;
  await assert.rejects(
    new YalidineClient({ id: "a", token: "b" }, { fetch: f429 }).testConnection(),
    (e: unknown) => e instanceof YalidineError && e.status === 429 && e.retryAfter === 12,
  );
});
