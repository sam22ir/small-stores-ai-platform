// Signed "state" for the Instagram login round trip. The browser leaves the dashboard, logs in at
// Instagram and comes back to a function with no session. The state ties that return trip to the
// store and the owner who started it, expires after 10 minutes, and can't be forged without the
// app secret.

const enc = new TextEncoder();
const dec = new TextDecoder();
export const STATE_TTL_MS = 10 * 60 * 1000;

export interface ConnectState {
  store_id: string;
  user_id: string;
  exp: number; // epoch ms
}

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function unb64url(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacKey(secret: string, usage: "sign" | "verify") {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [usage]);
}

// Domain-separated so a signature made here can't be replayed as anything else.
const PREFIX = "ig-connect-state.v1.";

export async function signState(
  input: { store_id: string; user_id: string },
  secret: string,
  now = Date.now(),
): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ ...input, exp: now + STATE_TTL_MS })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret, "sign"), enc.encode(PREFIX + payload)));
  return `${payload}.${b64url(sig)}`;
}

export async function verifyState(token: string, secret: string, now = Date.now()): Promise<ConnectState | null> {
  if (!secret) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  try {
    const ok = await crypto.subtle.verify(
      "HMAC",
      await hmacKey(secret, "verify"),
      unb64url(sig) as BufferSource,
      enc.encode(PREFIX + payload),
    );
    if (!ok) return null;
    const parsed = JSON.parse(dec.decode(unb64url(payload))) as Partial<ConnectState>;
    if (typeof parsed.store_id !== "string" || typeof parsed.user_id !== "string" || typeof parsed.exp !== "number") {
      return null;
    }
    if (parsed.exp < now) return null;
    return { store_id: parsed.store_id, user_id: parsed.user_id, exp: parsed.exp };
  } catch {
    return null;
  }
}
