import assert from "node:assert/strict";
import { test } from "node:test";
import { importWithReload, reloadForNewDeploy } from "./chunkReload.ts";

function env(now = 1_000_000) {
  const store = new Map<string, string>();
  const state = { reloads: 0, now };
  return {
    state,
    env: {
      storage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
      reload: () => { state.reloads++; },
      now: () => state.now,
    },
  };
}

test("reloads once, then not again inside the window", () => {
  const { env: e, state } = env();
  assert.equal(reloadForNewDeploy(e), true);
  state.now += 5_000;
  assert.equal(reloadForNewDeploy(e), false);
  assert.equal(state.reloads, 1);
});

test("reloads again after the window has passed", () => {
  const { env: e, state } = env();
  reloadForNewDeploy(e);
  state.now += 31_000;
  assert.equal(reloadForNewDeploy(e), true);
  assert.equal(state.reloads, 2);
});

test("a storage that throws means no reload (no loop)", () => {
  const e = {
    storage: { getItem: () => { throw new Error("denied"); }, setItem: () => {} },
    reload: () => assert.fail("must not reload"),
    now: () => 1,
  };
  assert.equal(reloadForNewDeploy(e), false);
});

test("importWithReload passes a good import through untouched", async () => {
  const { env: e, state } = env();
  assert.equal(await importWithReload(() => Promise.resolve("ok"), e), "ok");
  assert.equal(state.reloads, 0);
});

test("a failed import reloads once and never settles; a repeat failure surfaces the error", async () => {
  const { env: e, state } = env();
  const boom = () => Promise.reject(new TypeError("Failed to fetch dynamically imported module"));
  const first = importWithReload(boom, e);
  const settled = await Promise.race([first.then(() => "resolved", () => "rejected"), new Promise((r) => setTimeout(() => r("pending"), 20))]);
  assert.equal(settled, "pending");
  assert.equal(state.reloads, 1);
  await assert.rejects(importWithReload(boom, e), /dynamically imported/);
  assert.equal(state.reloads, 1);
});
