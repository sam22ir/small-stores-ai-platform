import assert from "node:assert/strict";
import { test } from "node:test";
import { stripStrayLabels } from "./reply-clean.ts";
import { scriptProblem } from "./language.ts";

test("a trailing stray VOICE label is removed and the text kept", () => {
  assert.equal(stripStrayLabels("Mrahba bik.\nVOICE: Tafaḍḍal."), "Mrahba bik.\nTafaḍḍal.");
});

test("a leading ASSISTANT label is removed", () => {
  assert.equal(stripStrayLabels("ASSISTANT: Iyeh, kayen."), "Iyeh, kayen.");
});

test("a label alone on its line is dropped", () => {
  assert.equal(stripStrayLabels("Kayen 3500 DA.\nREPLY:"), "Kayen 3500 DA.");
});

test("summary field labels and mixed-case labels are kept", () => {
  const summary = "• Hoodie × 1: 3500 DZD\n• Delivery: 600 DZD\nTOTAL: 4100 DZD";
  assert.equal(stripStrayLabels(summary), summary);
  assert.equal(stripStrayLabels("Total: 4100 DZD"), "Total: 4100 DZD");
  assert.equal(stripStrayLabels("DZD 4100"), "DZD 4100");
});

test("a label in the middle of the reply is not touched", () => {
  assert.equal(stripStrayLabels("Line one.\nVOICE: middle\nLine three."), "Line one.\nVOICE: middle\nLine three.");
});

test("a reply that would become empty keeps its original text", () => {
  assert.equal(stripStrayLabels("VOICE:"), "VOICE:");
});

test("Chinese, Thai and Devanagari letters are a script problem in any conversation", () => {
  assert.equal(scriptProblem("Kayen 3500 DA. 青青青", "dz"), "foreign_script");
  assert.equal(scriptProblem("Kayen 3500 DA. 青青青", null), "foreign_script");
  assert.equal(scriptProblem("ประเทศไทย", "en"), "foreign_script");
  assert.equal(scriptProblem("नमस्ते", "fr"), "foreign_script");
  assert.equal(scriptProblem("こんにちは", "ar"), "foreign_script");
  assert.equal(scriptProblem("안녕하세요", "en"), "foreign_script");
});

test("Latin letters with diacritics, Arabic script and Latin marks are fine", () => {
  assert.equal(scriptProblem("Tafaḍḍal, cité Ouzemour, ça va ? ʿa", "dz"), null);
  assert.equal(scriptProblem("شكرا، kayen 3500 DA", "en"), null);
  assert.equal(scriptProblem("Hoodie 3500 DA 🙂", "dz"), null);
});

test("Cyrillic keeps its own kind", () => {
  assert.equal(scriptProblem("Бла", null), "cyrillic_letters");
});
