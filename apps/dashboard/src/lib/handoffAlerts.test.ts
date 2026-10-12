import assert from "node:assert/strict";
import { test } from "node:test";
import { alertBody, isWaiting, newHandoffs, NOTIFY_KEY, readPref, SOUND_KEY, titleWithCount, waitingIds, waitingRows, writePref } from "./handoffAlerts.ts";
import type { HandoffRow } from "./handoffAlerts.ts";

const row = (over: Partial<HandoffRow> = {}): HandoffRow => ({
  id: "c1", status: "human", handoff_reason: "Wants a refund", customer_name: "Sara", platform: "instagram", ...over,
});

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
  };
}

const throwingStorage = {
  getItem: () => { throw new Error("blocked"); },
  setItem: () => { throw new Error("blocked"); },
};

test("a human chat with a handoff reason is waiting", () => {
  assert.equal(isWaiting(row()), true);
});

test("an owner reply (human, reason cleared) is not waiting", () => {
  assert.equal(isWaiting(row({ handoff_reason: null })), false);
});

test("a bot chat is not waiting, even with a reason", () => {
  assert.equal(isWaiting(row({ status: "bot" })), false);
});

test("a closed chat is not waiting", () => {
  assert.equal(isWaiting(row({ status: "closed" })), false);
});

test("test chats (playground) are never waiting", () => {
  assert.equal(isWaiting(row({ platform: "playground" })), false);
});

test("waitingRows and waitingIds keep only the waiting chats", () => {
  const rows = [row({ id: "a" }), row({ id: "b", handoff_reason: null }), row({ id: "c", status: "bot" })];
  assert.deepEqual(waitingRows(rows).map((r) => r.id), ["a"]);
  assert.deepEqual([...waitingIds(rows)], ["a"]);
});

test("the first load is a baseline: chats already waiting do not alert", () => {
  assert.deepEqual(newHandoffs(null, [row({ id: "a" }), row({ id: "b" })]), []);
});

test("a chat that was not waiting before and is now returns as new", () => {
  const prev = new Set(["a"]);
  const fresh = newHandoffs(prev, [row({ id: "a" }), row({ id: "b", customer_name: "Amine" })]);
  assert.deepEqual(fresh.map((r) => r.id), ["b"]);
  assert.equal(fresh[0].customer_name, "Amine");
});

test("an owner reply in a chat with no reason never counts as new", () => {
  const fresh = newHandoffs(new Set(), [row({ id: "x", handoff_reason: null })]);
  assert.deepEqual(fresh, []);
});

test("a chat that keeps waiting is not new again", () => {
  assert.deepEqual(newHandoffs(new Set(["a"]), [row({ id: "a" })]), []);
});

test("a chat resolved and handed over again alerts again", () => {
  const afterResolve = waitingIds([row({ id: "a", status: "bot", handoff_reason: null })]);
  const again = newHandoffs(afterResolve, [row({ id: "a" })]);
  assert.deepEqual(again.map((r) => r.id), ["a"]);
});

test("titleWithCount prefixes a positive count only", () => {
  assert.equal(titleWithCount("Store Assistant", 3), "(3) Store Assistant");
  assert.equal(titleWithCount("Store Assistant", 0), "Store Assistant");
  assert.equal(titleWithCount("Store Assistant", -1), "Store Assistant");
});

test("alertBody joins the customer name and the reason", () => {
  assert.equal(alertBody("Sara", "Wants a refund"), "Sara: Wants a refund");
});

test("prefs default to off and read back what was written", () => {
  const s = memoryStorage();
  assert.equal(readPref(SOUND_KEY, s), false);
  writePref(SOUND_KEY, true, s);
  assert.equal(readPref(SOUND_KEY, s), true);
  writePref(SOUND_KEY, false, s);
  assert.equal(readPref(SOUND_KEY, s), false);
  assert.equal(s.data.get(SOUND_KEY), "0");
});

test("the sound and notify prefs are stored under their own keys", () => {
  const s = memoryStorage();
  writePref(NOTIFY_KEY, true, s);
  assert.equal(s.data.has(NOTIFY_KEY), true);
  assert.equal(readPref(SOUND_KEY, s), false);
});

test("prefs survive a storage that throws", () => {
  assert.equal(readPref(NOTIFY_KEY, throwingStorage), false);
  assert.doesNotThrow(() => writePref(NOTIFY_KEY, true, throwingStorage));
});

test("prefs with no storage at all read as off and do not throw", () => {
  assert.equal(readPref(NOTIFY_KEY, null), false);
  assert.doesNotThrow(() => writePref(NOTIFY_KEY, true, null));
});
