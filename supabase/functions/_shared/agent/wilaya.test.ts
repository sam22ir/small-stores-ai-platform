import { test } from "node:test";
import assert from "node:assert/strict";
import { matchWilaya, normalizeWilaya, WILAYA_CODES } from "./wilaya.ts";

test("French, Arabic and Latin spellings map to the wilaya code", () => {
  assert.equal(normalizeWilaya("Alger"), "16");
  assert.equal(normalizeWilaya("الجزائر"), "16");
  assert.equal(normalizeWilaya("Constantine"), "25");
  assert.equal(normalizeWilaya("قسنطينة"), "25");
  assert.equal(normalizeWilaya("Oran"), "31");
  assert.equal(normalizeWilaya("وهران"), "31");
  assert.equal(normalizeWilaya("Tizi Ouzou"), "15");
  assert.equal(normalizeWilaya("تيزي وزو"), "15");
});

test("common variants and transliterations are recognised", () => {
  assert.equal(normalizeWilaya("alger"), "16");
  assert.equal(normalizeWilaya("algiers"), "16");
  assert.equal(normalizeWilaya("dzayer"), "16");
  assert.equal(normalizeWilaya("qsentina"), "25");
  assert.equal(normalizeWilaya("wahran"), "31");
  assert.equal(normalizeWilaya("tizi"), "15");
  assert.equal(normalizeWilaya("bgayet"), "06");
  assert.equal(normalizeWilaya("bougie"), "06");
  assert.equal(normalizeWilaya("Sidi Belabbes"), "22");
  assert.equal(normalizeWilaya("Bône"), "23");
  assert.equal(normalizeWilaya("wilaya d'Alger"), "16");
  assert.equal(normalizeWilaya("ولاية الجزائر"), "16");
  assert.equal(normalizeWilaya("الجزائر العاصمة"), "16");
});

test("accents, apostrophes, hyphens, case and spacing are ignored", () => {
  assert.equal(normalizeWilaya("BÉJAÏA"), "06");
  assert.equal(normalizeWilaya("Béjaïa"), "06");
  assert.equal(normalizeWilaya("  bejaia  "), "06");
  assert.equal(normalizeWilaya("Tizi-Ouzou"), "15");
  assert.equal(normalizeWilaya("tizi ouzou"), "15");
  assert.equal(normalizeWilaya("Setif"), "19");
  assert.equal(normalizeWilaya("Sétif"), "19");
  assert.equal(normalizeWilaya("M'Sila"), "28");
  assert.equal(normalizeWilaya("msila"), "28");
  assert.equal(normalizeWilaya("Naama"), "45");
  assert.equal(normalizeWilaya("Aïn Témouchent"), "46");
  assert.equal(normalizeWilaya("ain temouchent"), "46");
  assert.equal(normalizeWilaya("El Oued"), "39");
  assert.equal(normalizeWilaya("oued"), "39");
  assert.equal(normalizeWilaya("Médéa"), "26");
});

test("wilaya codes are accepted in several written forms", () => {
  assert.equal(normalizeWilaya("16"), "16");
  assert.equal(normalizeWilaya("016"), "16");
  assert.equal(normalizeWilaya("6"), "06");
  assert.equal(normalizeWilaya("#31"), "31");
  assert.equal(normalizeWilaya("wilaya 31"), "31");
  assert.equal(normalizeWilaya("58"), "58");
  assert.equal(normalizeWilaya("59"), null);
  assert.equal(normalizeWilaya("0"), null);
});

test("unknown or empty input maps to null", () => {
  assert.equal(normalizeWilaya(""), null);
  assert.equal(normalizeWilaya("   "), null);
  assert.equal(normalizeWilaya("Paris"), null);
  assert.equal(normalizeWilaya("wilaya"), null);
});

test("every one of the 58 wilayas resolves to its own code", () => {
  assert.equal(WILAYA_CODES.length, 58);
  assert.equal(new Set(WILAYA_CODES).size, 58);
  for (const code of WILAYA_CODES) assert.equal(normalizeWilaya(code), code);
});

test("matchWilaya returns the store's own spelling", () => {
  const store = ["Alger", "Oran", "Tizi Ouzou", "Béjaïa"];
  assert.equal(matchWilaya("Alger", store), "Alger");
  assert.equal(matchWilaya("algiers", store), "Alger");
  assert.equal(matchWilaya("الجزائر", store), "Alger");
  assert.equal(matchWilaya("wahran", store), "Oran");
  assert.equal(matchWilaya("bgayet", store), "Béjaïa");
  assert.equal(matchWilaya("15", store), "Tizi Ouzou");
  assert.equal(matchWilaya("Constantine", store), null);
  assert.equal(matchWilaya("Paris", store), null);
});

test("matchWilaya prefers an exact match and returns null for an empty store list", () => {
  assert.equal(matchWilaya("oran", ["Oran", "ORAN "]), "Oran");
  assert.equal(matchWilaya("Alger", []), null);
});
