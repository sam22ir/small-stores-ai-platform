import assert from "node:assert/strict";
import { test } from "node:test";
import { decryptSecret, encryptSecret } from "./crypto.ts";

const KEY = Buffer.alloc(32, 7).toString("base64");

test("a token round-trips and is not stored in the clear", async () => {
  const blob = await encryptSecret("IGAAtoken123", KEY);
  assert.match(blob, /^v1:/);
  assert.ok(!blob.includes("IGAAtoken123"));
  assert.equal(await decryptSecret(blob, KEY), "IGAAtoken123");
});

test("every encryption uses a fresh nonce", async () => {
  assert.notEqual(await encryptSecret("x", KEY), await encryptSecret("x", KEY));
});

test("a wrong key or a tampered blob is rejected", async () => {
  const blob = await encryptSecret("secret", KEY);
  await assert.rejects(decryptSecret(blob, Buffer.alloc(32, 9).toString("base64")));
  const [v, iv, ct] = blob.split(":");
  const flipped = Buffer.from(ct, "base64");
  flipped[0] ^= 1;
  await assert.rejects(decryptSecret(`${v}:${iv}:${flipped.toString("base64")}`, KEY));
});

test("a missing or wrongly sized key fails loudly", async () => {
  await assert.rejects(encryptSecret("x", undefined), /not set/);
  await assert.rejects(encryptSecret("x", Buffer.alloc(16).toString("base64")), /32 bytes/);
});
