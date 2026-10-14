import { test } from "node:test";
import assert from "node:assert/strict";
import { editDistance, fuzzyWilayaCodes, resolveStoreWilaya, resolveWilaya } from "./wilaya.ts";

test("typos that are one edit from one wilaya are corrected to its code", () => {
  assert.deepEqual(resolveWilaya("Tbessa"), { status: "corrected", code: "12", from: "Tbessa" });
  assert.deepEqual(resolveWilaya("Tizi Wzou"), { status: "corrected", code: "15", from: "Tizi Wzou" });
  assert.deepEqual(resolveWilaya("Oren"), { status: "corrected", code: "31", from: "Oren" });
  assert.deepEqual(resolveWilaya("Tebesaa"), { status: "corrected", code: "12", from: "Tebesaa" });
  assert.deepEqual(resolveWilaya("Setfi"), { status: "corrected", code: "19", from: "Setfi" });
});

test("exact and variant spellings, Arabic included, are not treated as typos", () => {
  assert.deepEqual(resolveWilaya("Tizi ouzou"), { status: "exact", code: "15" });
  assert.deepEqual(resolveWilaya("Tizi ouzo"), { status: "corrected", code: "15", from: "Tizi ouzo" });
  assert.deepEqual(resolveWilaya("Wahran"), { status: "exact", code: "31" });
  assert.deepEqual(resolveWilaya("تبسة"), { status: "exact", code: "12" });
  assert.deepEqual(resolveWilaya("Oran"), { status: "exact", code: "31" });
});

test("two candidate wilayas within the threshold are ambiguous, not guessed", () => {
  // "Sila" is one edit from Msila (28) and from Mila (43).
  assert.deepEqual(fuzzyWilayaCodes("Sila"), ["28", "43"]);
  assert.deepEqual(resolveWilaya("Sila"), { status: "ambiguous", codes: ["28", "43"] });
  // "Bana" is one edit from Batna (05) and from Bona/Annaba (23).
  assert.deepEqual(resolveWilaya("Bana"), { status: "ambiguous", codes: ["05", "23"] });
});

test("names that are not close to any wilaya, and very short inputs, are unknown", () => {
  assert.deepEqual(resolveWilaya("Narnia"), { status: "unknown" });
  // Three letters allow no typo, so "Ain" is unknown rather than a guess.
  assert.deepEqual(resolveWilaya("Ain"), { status: "unknown" });
  assert.deepEqual(resolveWilaya(""), { status: "unknown" });
});

test("edit distance counts Damerau transpositions as one edit", () => {
  assert.equal(editDistance("oran", "oran"), 0);
  assert.equal(editDistance("oren", "oran"), 1);
  assert.equal(editDistance("oarn", "oran"), 1);
  assert.equal(editDistance("tbessa", "tebessa"), 1);
  // Raw letters: ه and ة differ, so one edit here. foldWilaya unifies them before matching, so the
  // customer's "تبسه" still resolves to Tébessa through the exact path.
  assert.equal(editDistance("تبسه", "تبسة"), 1);
  assert.deepEqual(resolveWilaya("تبسه"), { status: "exact", code: "12" });
});

test("store-level match returns the store's own spelling, with the typo flag", () => {
  const names = ["Tébessa", "Oran", "Alger"];
  assert.deepEqual(resolveStoreWilaya("Tbessa", names), {
    kind: "match",
    name: "Tébessa",
    corrected: true,
    from: "Tbessa",
  });
  assert.deepEqual(resolveStoreWilaya("تبسة", names), { kind: "match", name: "Tébessa", corrected: false });
  assert.deepEqual(resolveStoreWilaya("Oran", names), { kind: "match", name: "Oran", corrected: false });
});

test("a real wilaya the store does not serve is not_served, and ambiguity lists only served spellings", () => {
  const names = ["Oran", "Alger"];
  assert.deepEqual(resolveStoreWilaya("Tamanrasset", names), { kind: "not_served", code: "11" });
  // "Sila" is ambiguous between Msila and Mila; only Mila is in the store's list, so ask about that one.
  const store = ["Mila", "Oran"];
  assert.deepEqual(resolveStoreWilaya("Sila", store), { kind: "ambiguous", names: ["Mila"] });
  assert.deepEqual(resolveStoreWilaya("Narnia", names), { kind: "unknown" });
});
