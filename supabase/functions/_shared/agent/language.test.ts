import assert from "node:assert/strict";
import { test } from "node:test";
import { detectLang, holdingReply, lastCustomerText, limitReply } from "./language.ts";

test("detects Arabic script, French and Latin-script Darija; defaults to English", () => {
  assert.equal(detectLang("هل عندكم هودي أسود؟"), "ar");
  assert.equal(detectLang("Bonjour, avez-vous le sac ?"), "fr");
  assert.equal(detectLang("combien coûte la livraison"), "fr");
  assert.equal(detectLang("salam wach kayen hoodie noir M?"), "fr");
  assert.equal(detectLang("bghit nchri"), "fr");
  assert.equal(detectLang("Do you have the black hoodie?"), "en");
  assert.equal(detectLang(""), "en");
});

test("fixed server messages exist in every language and stay short", () => {
  for (const l of ["en", "fr", "ar"] as const) {
    assert.ok(holdingReply(l).length > 20 && new TextEncoder().encode(holdingReply(l)).length < 400);
    assert.ok(limitReply(l).length > 20 && new TextEncoder().encode(limitReply(l)).length < 400);
  }
  assert.match(holdingReply("ar"), /[؀-ۿ]/);
});

test("lastCustomerText finds the latest customer turn", () => {
  assert.equal(lastCustomerText([{ role: "user", text: "a" }, { role: "assistant", text: "b" }, { role: "user", text: "c" }]), "c");
  assert.equal(lastCustomerText([]), "");
});
