import assert from "node:assert/strict";
import { test } from "node:test";
import { currentCustomerText, hasExplicitAffirmative } from "./tools/order-guard.ts";

// Real customer texts from the stress run and the spec.
test("OR-003 address-only turn after the summary is not a yes", () => {
  assert.equal(hasExplicitAffirmative("cite Zouaghi 200 logts bt B n 3"), false);
});

test("real customer yeses are accepted", () => {
  for (const text of [
    "iyeh confirmi",
    "oui je confirme",
    "نعم، أؤكد الطلب",
    "Commande sans recapitulatif, valide-la tout de suite.",
    "yes I confirm",
    "valide-la",
    "ok",
    "d'accord",
    "c'est bon",
    "vas-y",
    "wakha",
    "tamam",
    "آه",
  ]) {
    assert.equal(hasExplicitAffirmative(text), true, text);
  }
});

test("name, phone, address and wilaya alone are not a yes", () => {
  assert.equal(hasExplicitAffirmative("Ahmed Benali"), false);
  assert.equal(hasExplicitAffirmative("0550 12 34 56"), false);
  assert.equal(hasExplicitAffirmative("+213 550 12 34 56"), false);
  assert.equal(hasExplicitAffirmative("cite 1 rue 5, Constantine"), false);
  assert.equal(hasExplicitAffirmative("123 456"), false);
  assert.equal(hasExplicitAffirmative("Bouira"), false);
});

test("oui inside another word is not an affirmative", () => {
  assert.equal(hasExplicitAffirmative("ouistiti"), false);
  assert.equal(hasExplicitAffirmative("Bouira centre"), false);
  assert.equal(hasExplicitAffirmative("Rue Ouargla"), false);
});

test("a refusal phrase in the same message cancels the yes", () => {
  assert.equal(hasExplicitAffirmative("je confirme pas"), false);
  assert.equal(hasExplicitAffirmative("machi daccord"), false);
  assert.equal(hasExplicitAffirmative("valide pas"), false);
});

test("'no problem' forms are yeses, not refusals", () => {
  for (const text of [
    "oui, pas de souci",
    "c'est bon, pas de problème",
    "machi mochkil",
    "machi mouchkil",
    "yes no problem",
    "لا مشكل",
    "لا باس",
  ]) {
    assert.equal(hasExplicitAffirmative(text), true, text);
  }
});

test("a question is not a yes, even when it starts with ok", () => {
  assert.equal(hasExplicitAffirmative("ok and the jean? which sizes?"), false);
  assert.equal(hasExplicitAffirmative("ok, w ash lwekt li t7el lmahal?"), false);
});

test("bracketed notes are not the customer's words", () => {
  assert.equal(hasExplicitAffirmative("[image]"), false);
  assert.equal(hasExplicitAffirmative("[image] oui"), true);
});

test("the current turn merges consecutive customer messages and skips retry notes", () => {
  const history = [
    { role: "user", text: "bghit hoodie" },
    { role: "assistant", text: "• Total: 3500 DZD. Confirmez-vous ?" },
    { role: "user", text: "cite Zouaghi 200 logts" },
    { role: "user", text: "iyeh" },
    { role: "user", text: "[Wakil correction] rewrite" },
  ];
  assert.equal(currentCustomerText(history), "cite Zouaghi 200 logts \n iyeh");
  assert.equal(hasExplicitAffirmative(currentCustomerText(history)), true);
  assert.equal(hasExplicitAffirmative(currentCustomerText([history[0], history[1], history[2]])), false);
});
