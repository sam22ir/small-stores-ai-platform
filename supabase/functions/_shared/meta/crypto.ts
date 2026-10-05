// Encrypts per-store Meta access tokens at rest (AES-256-GCM). The key lives only in the
// Edge Function secret CREDENTIALS_ENCRYPTION_KEY (32 random bytes, base64), never in the database.
// Stored format: "v1:<iv>:<ciphertext+tag>", both base64.

const enc = new TextEncoder();
const dec = new TextDecoder();

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function importKey(keyB64: string | undefined): Promise<CryptoKey> {
  if (!keyB64) throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set");
  const raw = fromB64(keyB64);
  if (raw.length !== 32) throw new Error("CREDENTIALS_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
  return crypto.subtle.importKey("raw", raw as BufferSource, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(plain: string, keyB64: string | undefined): Promise<string> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource }, key, enc.encode(plain)),
  );
  return `v1:${toB64(iv)}:${toB64(ct)}`;
}

export async function decryptSecret(blob: string, keyB64: string | undefined): Promise<string> {
  const [version, iv, ct] = blob.split(":");
  if (version !== "v1" || !iv || !ct) throw new Error("Unknown credential format");
  const key = await importKey(keyB64);
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromB64(iv) as BufferSource },
    key,
    fromB64(ct) as BufferSource,
  );
  return dec.decode(plain);
}
