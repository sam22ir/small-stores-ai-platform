import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationLang, detectLang, holdingReply, lastCustomerText, limitReply } from "./language.ts";

test("detects Arabic script, French, Latin-script Darija and English", () => {
  assert.equal(detectLang("هل عندكم هودي أسود؟"), "ar");
  assert.equal(detectLang("Bonjour, avez-vous le sac ?"), "fr");
  assert.equal(detectLang("Bonjour, le jean en 40 il coûte combien ?"), "fr");
  assert.equal(detectLang("combien coûte la livraison"), "fr");
  assert.equal(detectLang("Do you have the black hoodie?"), "en");
  assert.equal(detectLang(""), "en");
});

test("Latin-script Darija is detected as dz, not French", () => {
  for (const t of [
    "salam",
    "salam wach kayen hoodie noir M?",
    "b9addeh hoodie noir? kayen taille M?",
    "bghit nchri",
    "smiti Karim",
    "ih confirmé",
    "saha, ya3tik saha",
  ]) {
    assert.equal(detectLang(t), "dz", t);
  }
});

test("a message with no clear language gives no signal and keeps the conversation's language", () => {
  const darija = [
    { role: "user", text: "bghit nchri hoodie noir" },
    { role: "assistant", text: "Hoodie noir b 3500 DA, taille M kayna. Bghiti tcommandi?" },
    { role: "user", text: "ok" },
  ];
  assert.equal(conversationLang(darija), "dz");
  assert.equal(conversationLang([{ role: "user", text: "ok" }]), "en");
  assert.equal(conversationLang([{ role: "user", text: "هل عندكم هودي" }, { role: "user", text: "Karim" }]), "ar");
  assert.equal(conversationLang([{ role: "user", text: "bonjour le sac" }, { role: "user", text: "11" }]), "fr");
});

test("fixed server messages exist in every language and stay short", () => {
  for (const l of ["en", "fr", "ar", "dz"] as const) {
    assert.ok(holdingReply(l).length > 20 && new TextEncoder().encode(holdingReply(l)).length < 400);
    assert.ok(limitReply(l).length > 20 && new TextEncoder().encode(limitReply(l)).length < 400);
  }
  assert.match(holdingReply("ar"), /[؀-ۿ]/);
  assert.doesNotMatch(holdingReply("dz"), /votre|vous/);
});

test("lastCustomerText finds the latest customer turn", () => {
  assert.equal(lastCustomerText([{ role: "user", text: "a" }, { role: "assistant", text: "b" }, { role: "user", text: "c" }]), "c");
  assert.equal(lastCustomerText([]), "");
});
