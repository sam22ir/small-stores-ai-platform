import assert from "node:assert/strict";
import { test } from "node:test";
import { signState, STATE_TTL_MS, verifyState } from "./state.ts";

const ids = { store_id: "store-1", user_id: "user-1" };

test("a state we signed verifies and carries the store and owner", async () => {
  const token = await signState(ids, "secret", 1000);
  const st = await verifyState(token, "secret", 1000 + 5000);
  assert.deepEqual(st && { store_id: st.store_id, user_id: st.user_id }, ids);
});

test("it expires after ten minutes", async () => {
  const token = await signState(ids, "secret", 0);
  assert.ok(await verifyState(token, "secret", STATE_TTL_MS - 1));
  assert.equal(await verifyState(token, "secret", STATE_TTL_MS + 1), null);
});

test("a different secret, edited payload, or junk is rejected", async () => {
  const token = await signState(ids, "secret", 0);
  assert.equal(await verifyState(token, "other", 1), null);
  const [payload, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ ...ids, store_id: "victim", exp: 9e15 })).toString("base64url");
  assert.equal(await verifyState(`${forged}.${sig}`, "secret", 1), null);
  assert.equal(await verifyState(`${payload}.${sig}.extra`, "secret", 1), null);
  assert.equal(await verifyState("not-a-token", "secret", 1), null);
  assert.equal(await verifyState(token, "", 1), null);
});
