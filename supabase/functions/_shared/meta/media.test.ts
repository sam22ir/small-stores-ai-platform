import assert from "node:assert/strict";
import { afterEach, mock, test } from "node:test";
import { fetchImageDataUrl } from "./media.ts";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer;
const CDN = "https://scontent.cdninstagram.com/v/photo.jpg";

type Call = { url: string; init: RequestInit };

// A scripted fetch: one Response per call, in order. Records what was requested.
function scripted(...responses: Response[]) {
  const calls: Call[] = [];
  const fetchImpl = ((url: string, init: RequestInit) => {
    calls.push({ url, init });
    const next = responses.shift();
    return Promise.resolve(next ?? new Response("unexpected", { status: 500 }));
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const image = (type = "image/png", body: ArrayBuffer = PNG, headers: Record<string, string> = {}) =>
  new Response(body, { status: 200, headers: { "content-type": type, ...headers } });

afterEach(() => mock.restoreAll());

test("an image from an allowed Meta host is fetched and returned as a data URL", async () => {
  const { fetchImpl, calls } = scripted(image());
  const r = await fetchImageDataUrl(CDN, { fetch: fetchImpl });
  assert.deepEqual(r, { ok: true, mime: "image/png", dataUrl: "data:image/png;base64,iVBORw==" });
  assert.equal(calls[0].init.redirect, "manual");
  assert.ok(calls[0].init.signal instanceof AbortSignal);
});

test("the content type may carry a charset parameter", async () => {
  const { fetchImpl } = scripted(image("image/jpeg; charset=binary"));
  const r = await fetchImageDataUrl("https://a.fbcdn.net/x.jpg", { fetch: fetchImpl });
  assert.equal(r.ok && r.mime, "image/jpeg");
});

test("a disallowed host is rejected without a request and logged by host", async () => {
  const warn = mock.method(console, "warn", () => {});
  const { fetchImpl, calls } = scripted(image());
  const r = await fetchImageDataUrl("https://example.com/photo.jpg", { fetch: fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 0);
  assert.deepEqual(warn.mock.calls[0].arguments, ["media: host not allowed", "example.com"]);
});

test("look-alike hosts are rejected: the suffix needs a dot before it", async () => {
  const { fetchImpl, calls } = scripted(image());
  mock.method(console, "warn", () => {});
  assert.equal((await fetchImageDataUrl("https://evilfbcdn.net/a.jpg", { fetch: fetchImpl })).ok, false);
  assert.equal((await fetchImageDataUrl("https://fbcdn.net.evil.com/a.jpg", { fetch: fetchImpl })).ok, false);
  assert.equal(calls.length, 0);
});

test("plain http is rejected", async () => {
  const { fetchImpl, calls } = scripted(image());
  const r = await fetchImageDataUrl("http://scontent.cdninstagram.com/a.jpg", { fetch: fetchImpl });
  assert.deepEqual(r, { ok: false, reason: "not https" });
  assert.equal(calls.length, 0);
});

test("a redirect to a disallowed host is rejected, and that host is never requested", async () => {
  mock.method(console, "warn", () => {});
  const { fetchImpl, calls } = scripted(
    new Response(null, { status: 302, headers: { location: "https://169.254.169.254/latest/meta-data" } }),
  );
  const r = await fetchImageDataUrl(CDN, { fetch: fetchImpl });
  assert.equal(r.ok, false);
  assert.equal(calls.length, 1);
});

test("a redirect to another allowed host is followed", async () => {
  const { fetchImpl, calls } = scripted(
    new Response(null, { status: 301, headers: { location: "https://scontent.fbsbx.com/moved.png" } }),
    image(),
  );
  const r = await fetchImageDataUrl(CDN, { fetch: fetchImpl });
  assert.equal(r.ok, true);
  assert.equal(calls[1].url, "https://scontent.fbsbx.com/moved.png");
});

test("a redirect chain longer than two hops is rejected", async () => {
  const hop = (to: string) => new Response(null, { status: 302, headers: { location: to } });
  const { fetchImpl, calls } = scripted(
    hop("https://a.fbcdn.net/1"),
    hop("https://a.fbcdn.net/2"),
    hop("https://a.fbcdn.net/3"),
    image(),
  );
  const r = await fetchImageDataUrl(CDN, { fetch: fetchImpl });
  assert.deepEqual(r, { ok: false, reason: "too many redirects" });
  assert.equal(calls.length, 3);
});

test("an image declared larger than the cap is rejected", async () => {
  const { fetchImpl } = scripted(image("image/png", PNG, { "content-length": String(4 * 1024 * 1024) }));
  const r = await fetchImageDataUrl(CDN, { fetch: fetchImpl, maxBytes: 3 * 1024 * 1024 });
  assert.deepEqual(r, { ok: false, reason: "too large" });
});

test("an image without an honest content-length is still cut off while reading", async () => {
  const big = new Uint8Array(1024);
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(big);
      c.enqueue(big);
      c.close();
    },
  });
  const { fetchImpl } = scripted(new Response(stream, { status: 200, headers: { "content-type": "image/png" } }));
  const r = await fetchImageDataUrl(CDN, { fetch: fetchImpl, maxBytes: 1500 });
  assert.deepEqual(r, { ok: false, reason: "too large" });
});

test("a type outside the image allowlist is rejected", async () => {
  for (const type of ["text/html", "image/svg+xml", "application/octet-stream"]) {
    const { fetchImpl } = scripted(image(type));
    const r = await fetchImageDataUrl(CDN, { fetch: fetchImpl });
    assert.deepEqual(r, { ok: false, reason: "unsupported type" }, type);
  }
});

test("an HTTP error is a failure", async () => {
  const { fetchImpl } = scripted(new Response("gone", { status: 404 }));
  assert.deepEqual(await fetchImageDataUrl(CDN, { fetch: fetchImpl }), { ok: false, reason: "http 404" });
});

test("a request that never answers times out as a failure instead of hanging", async () => {
  const hangs = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
    })) as unknown as typeof fetch;
  const r = await fetchImageDataUrl(CDN, { fetch: hangs, timeoutMs: 10 });
  assert.equal(r.ok, false);
});

test("a network error is a failure, never a throw", async () => {
  const broken = (() => Promise.reject(new TypeError("network down"))) as unknown as typeof fetch;
  assert.deepEqual(await fetchImageDataUrl(CDN, { fetch: broken }), { ok: false, reason: "TypeError" });
});

test("an invalid URL is a failure", async () => {
  assert.deepEqual(await fetchImageDataUrl("not a url"), { ok: false, reason: "invalid url" });
});
