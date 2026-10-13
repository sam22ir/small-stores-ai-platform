// Downloads a customer's photo from Meta's CDN so the model can look at it.
// The URL comes from the customer's message, so it is untrusted: only https links on Meta's image
// hosts are fetched, redirects are checked hop by hop, and the size and type are capped.

export type ImageMime = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type ImageResult =
  | { ok: true; dataUrl: string; mime: ImageMime }
  | { ok: false; reason: string };

export interface FetchImageOptions {
  fetch?: typeof fetch; // injectable for tests
  timeoutMs?: number;
  maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 2;
const ALLOWED_SUFFIXES = [".fbcdn.net", ".cdninstagram.com", ".fbsbx.com"];
const ALLOWED_EXACT = ["fbcdn.net"];
const ALLOWED_MIME: readonly string[] = ["image/jpeg", "image/png", "image/webp", "image/gif"];

function hostAllowed(host: string): boolean {
  return ALLOWED_EXACT.includes(host) || ALLOWED_SUFFIXES.some((s) => host.endsWith(s));
}

// Returns why the URL can't be fetched, or null when it may be fetched.
function rejectUrl(url: URL): string | null {
  if (url.protocol !== "https:") return "not https";
  if (!hostAllowed(url.hostname)) {
    // Only the host is logged: the full link is a signed CDN URL.
    console.warn("media: host not allowed", url.hostname);
    return "host not allowed";
  }
  return null;
}

// Standard base64 without spreading the whole array into one call (that overflows the stack).
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

// Reads the body while counting bytes, so a server that lies about content-length still can't
// make us hold more than maxBytes.
async function readCapped(res: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!res.body) return new Uint8Array();
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  return bytes;
}

export async function fetchImageDataUrl(url: string, opts: FetchImageOptions = {}): Promise<ImageResult> {
  const doFetch = opts.fetch ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  try {
    let current: URL;
    try {
      current = new URL(url);
    } catch {
      return { ok: false, reason: "invalid url" };
    }

    // Redirects are followed by hand so every hop is checked against the allowlist.
    let res: Response;
    for (let hop = 0;; hop++) {
      const rejected = rejectUrl(current);
      if (rejected) return { ok: false, reason: rejected };
      res = await doFetch(current.href, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
      if (res.status < 300 || res.status >= 400) break;
      if (hop >= MAX_REDIRECTS) return { ok: false, reason: "too many redirects" };
      const location = res.headers.get("location");
      if (!location) return { ok: false, reason: "redirect without location" };
      try {
        current = new URL(location, current);
      } catch {
        return { ok: false, reason: "bad redirect location" };
      }
    }

    if (!res.ok) return { ok: false, reason: `http ${res.status}` };

    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) return { ok: false, reason: "too large" };

    const mime = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME.includes(mime)) return { ok: false, reason: "unsupported type" };

    const bytes = await readCapped(res, maxBytes);
    if (!bytes) return { ok: false, reason: "too large" };

    return { ok: true, mime: mime as ImageMime, dataUrl: `data:${mime};base64,${toBase64(bytes)}` };
  } catch (err) {
    // Timeouts, network errors and aborted reads all end here: a photo is optional, never fatal.
    return { ok: false, reason: err instanceof Error ? err.name : "fetch failed" };
  }
}
