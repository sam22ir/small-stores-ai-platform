import { test } from "node:test";
import assert from "node:assert/strict";
import { scoreProduct, searchGroups } from "./search.ts";

const matches = (name: string, query: string) =>
  searchGroups(query).some((g) => g.some((v) => name.toLowerCase().includes(v)));

test("plurals match singular product names", () => {
  assert.ok(matches("Black Hoodie", "hoodies"));
  assert.ok(matches("Linen Shirt", "shirts"));
  assert.ok(matches("Silver Hoop Earrings", "earring"));
  assert.ok(matches("Summer Dress", "dresses"));
  assert.ok(matches("Canvas Tote Bag", "do you have tote bags?"));
});

test("filler words and short tokens are dropped", () => {
  assert.deepEqual(searchGroups("do you have the in a"), []);
  assert.deepEqual(searchGroups(""), []);
  assert.ok(searchGroups("do you have hoodies in M?").length === 1);
});

test("works for non-Latin scripts", () => {
  assert.deepEqual(searchGroups("هل عندكم قميص"), [["قميص"]]);
  assert.deepEqual(searchGroups("واش كاين قميص أسود"), [["قميص"], ["أسود"]]);
});

test("caps at five words and dedupes", () => {
  assert.equal(searchGroups("red blue green pink gold teal navy").length, 5);
  assert.equal(searchGroups("hoodie hoodie hoodie").length, 1);
});

test("name matches outrank description matches", () => {
  const groups = searchGroups("wallet");
  assert.ok(scoreProduct("Leather Wallet", null, groups) > scoreProduct("Gift box", "fits a wallet", groups));
  assert.equal(scoreProduct("Tote", null, groups), 0);
});

test("aliases count like the product name", () => {
  const groups = searchGroups("do you have kapuchon");
  assert.ok(scoreProduct("Black Hoodie", null, groups, "kapuchon, sweat") >= 2);
  assert.equal(scoreProduct("Black Hoodie", null, groups, null), 0);
});

test("Algerian Darija and French filler is not searched", () => {
  assert.deepEqual(searchGroups("wach kayen hoodie noir"), [["hoodie"], ["noir"]]);
  assert.deepEqual(searchGroups("bghit hoodie, chhal ch7al 3andkom?"), [["hoodie"]]);
  const fr = searchGroups("les robes pour femme svp");
  assert.equal(fr.length, 2);
  assert.ok(fr[0].includes("robes"));
  assert.deepEqual(fr[1], ["femme"]);
  assert.deepEqual(searchGroups("est-ce que vous avez sac avec poche"), [["sac"], ["poche"]]);
});
