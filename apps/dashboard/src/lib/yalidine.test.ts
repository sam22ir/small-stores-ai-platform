import assert from "node:assert/strict";
import { test } from "node:test";
import { cleanCredential, guessWilaya as guess } from "./yalidine.ts";
import { WILAYAS } from "./wilayas.ts";

const guessWilaya = (text: string) => guess(text, WILAYAS);

test("cleanCredential strips spaces, newlines, tabs and zero-width characters", () => {
  assert.equal(cleanCredential(" abc\n123\t"), "abc123");
  assert.equal(cleanCredential("ab\u200bc\u200cd\u200de\ufeff" + "f"), "abcdef");
  assert.equal(cleanCredential("tok\u00a0en"), "token");
});

test("cleanCredential leaves a clean credential unchanged", () => {
  assert.equal(cleanCredential("a1b2-C3d4_e5"), "a1b2-C3d4_e5");
  assert.equal(cleanCredential(""), "");
});

test("guessWilaya finds the wilaya named in an address", () => {
  assert.equal(guessWilaya("Rue 5, Oran"), 31);
  assert.equal(guessWilaya("bab ezzouar alger"), 16);
  assert.equal(guessWilaya("Béjaïa centre"), 6);
  assert.equal(guessWilaya("BEJAIA, cité 200"), 6);
});

test("guessWilaya prefers the longest name", () => {
  assert.equal(guessWilaya("Quartier Sidi Bel Abbès"), 22);
  assert.equal(guessWilaya("Aïn Defla centre"), 44);
  assert.equal(guessWilaya("M'Sila"), 28);
});

test("guessWilaya matches whole words only", () => {
  assert.equal(guessWilaya("Orangerie 3"), null);
  assert.equal(guessWilaya("nowhere"), null);
  assert.equal(guessWilaya(""), null);
});
