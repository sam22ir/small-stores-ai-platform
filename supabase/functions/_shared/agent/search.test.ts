import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collapse,
  editDistance,
  fold,
  fuzzyScore,
  fuzzySynonymGroups,
  queryWords,
  scoreProduct,
  searchGroups,
} from "./search.ts";

const matches = (name: string, query: string) =>
  searchGroups(query).some((g) => g.some((v) => fold(name).includes(fold(v))));
const groupWith = (query: string, word: string) =>
  searchGroups(query).find((g) => g.includes(fold(word)) || g.includes(word));

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
  // "4z" is two letters, so it is never a search word.
  assert.deepEqual(searchGroups("4z"), []);
  // The greeting with the article is filler too.
  assert.deepEqual(searchGroups("السلام عليكم"), []);
});

test("works for non-Latin scripts and keeps the original spelling as a variant", () => {
  const groups = searchGroups("واش كاين قميص أسود");
  assert.equal(groups.length, 2);
  assert.ok(groups[0].includes("قميص"));
  assert.ok(groups[1].includes("أسود"));
  assert.ok(groups[1].includes("اسود"), "folded form is an extra variant");
  assert.deepEqual(searchGroups("هل عندكم قميص").map((g) => g[0]), ["قميص"]);
});

test("Arabic article is stripped and letters are folded (ص/س, ة/ه, أ/ا, ى/ي)", () => {
  assert.ok(matches("Basket", "الحذاء"), "article on a synonym word");
  assert.ok(matches("Basket blanche", "الصبادري"), "ص folds to س and matches سبادري");
  assert.equal(fold("أ إ آ ا ى ة ص"), "ا ا ا ا ي ه س");
  assert.ok(matches("Casquette", "الكاسكيطة"));
  assert.ok(matches("Leather Wallet", "المحفظة") === false, "unknown words still do not match");
});

test("collapse repeated letters and strip accents", () => {
  assert.equal(collapse("basketttt"), "basket");
  assert.equal(collapse("hoodie"), "hoodie");
  assert.equal(fold("Béchar Jean"), "bechar jean");
  assert.ok(matches("Basket blanche", "basketttt"));
});

test("synonym groups: shoes, hoodie, jean and cap words reach each other", () => {
  assert.ok(matches("Basket blanche", "shoes"));
  assert.ok(matches("Basket blanche", "chaussure"));
  assert.ok(matches("Basket blanche", "sneakers"));
  assert.ok(matches("Hoodie noir", "sweat"));
  assert.ok(matches("Hoodie noir", "هودي"));
  assert.ok(matches("Jean slim bleu", "pantalon"));
  assert.ok(matches("Casquette noire", "قبعة"));
  assert.ok(matches("Casquette noire", "chapeau"));
  assert.ok(!matches("Canvas Tote Bag", "shoes"));
});

test("a word from a group gives the whole group as one OR group", () => {
  const g = groupWith("shoes", "shoes");
  assert.ok(g);
  for (const w of ["basket", "sneaker", "sbadri", "صباط", "حذاء", "basquete"]) {
    assert.ok(g.includes(fold(w)), `${w} is in the shoes group`);
  }
  // The raw Arabic spelling is kept too, for DB text written with ة or ص.
  assert.ok(g.includes("صباط"));
  assert.ok(searchGroups("كاسكيطة")[0].includes("كاسكيطة"), "raw cap spelling is kept");
});

test("plurals of group words still reach the group (hoodies, casquettes, caps, pantalons)", () => {
  assert.ok(searchGroups("hoodies")[0].includes("kapuchon"));
  assert.ok(searchGroups("casquettes")[0].includes("kaskita"));
  assert.ok(searchGroups("caps")[0].includes("casquette"));
  assert.ok(searchGroups("pantalons")[0].includes("jean"));
  assert.ok(searchGroups("sweats")[0].includes("هودي"));
});

test("caps at five words, puts synonym words first and dedupes", () => {
  assert.equal(searchGroups("red blue green pink gold teal navy").length, 5);
  assert.equal(searchGroups("hoodie hoodie hoodie").length, 1);
  // Five filler-heavy words before the shoe word must not push the shoe word out.
  const groups = searchGroups("ahmed bghit salam blue green pink teal, الحذاء ب ٦٥٠٠");
  assert.ok(groups.some((g) => g.includes(fold("حذاء"))), "the shoe word survives the cap");
  assert.equal(groups[0].includes(fold("حذاء")) || groups[0].includes("basket"), true, "synonym group leads");
});

test("numbers go last", () => {
  const groups = searchGroups("٦٥٠٠ jean");
  assert.ok(groups[0].includes("jean"));
});

test("name matches outrank description matches", () => {
  const groups = searchGroups("wallet");
  assert.ok(scoreProduct("Leather Wallet", null, groups) > scoreProduct("Gift box", "fits a wallet", groups));
  assert.equal(scoreProduct("Tote", null, groups), 0);
});

test("aliases count like the product name", () => {
  const groups = searchGroups("do you have kapuchon");
  assert.ok(scoreProduct("Black Tee", null, groups, "kapuchon, sweat") >= 2);
  assert.equal(scoreProduct("Black Tee", null, groups, null), 0);
});

test("casquette ranks the cap above a hoodie that only says capuche in its description", () => {
  const groups = searchGroups("casquette");
  const cap = scoreProduct("Casquette noire", "Casquette réglable, brodée.", groups, "cap, kaskita");
  const hoodie = scoreProduct("Hoodie noir", "Hoodie en coton, capuche, coupe oversize.", groups, "kapuchon");
  assert.ok(cap > hoodie);
});

test("Algerian Darija and French filler is not searched", () => {
  const wach = searchGroups("wach kayen hoodie noir");
  assert.equal(wach.length, 2);
  assert.ok(wach[0].includes("hoodie"));
  assert.ok(wach[1].includes("noir"));
  assert.equal(searchGroups("bghit hoodie, chhal ch7al 3andkom?").length, 1);
  const fr = searchGroups("les robes pour femme svp");
  assert.equal(fr.length, 2);
  assert.ok(fr[0].includes("robes"));
  assert.deepEqual(fr[1], ["femme"]);
  assert.deepEqual(searchGroups("est-ce que vous avez sac avec poche"), [["sac"], ["poche"]]);
});

test("edit distance counts one-letter typos and adjacent swaps", () => {
  assert.equal(editDistance("kapucho", "kapuchon"), 1);
  assert.equal(editDistance("hodie", "hoodie"), 1);
  assert.equal(editDistance("sbadir", "sbadri"), 1);
  assert.equal(editDistance("ab", "ba"), 1, "a transposition is one edit");
  assert.equal(editDistance("basket", "basket"), 0);
});

test("typo fallback expands a near-miss to a synonym group, never for short words", () => {
  const words = queryWords("kapucho sac");
  assert.deepEqual(words, ["kapucho", "sac"]);
  assert.equal(fuzzyScore(["sac"], "Casquette noire", "cap"), 0, "3-letter words never match fuzzily");
  const [hoodie] = fuzzySynonymGroups(words);
  assert.ok(hoodie.includes("kapuchon"));
  assert.ok(hoodie.includes(fold("هودي")));
  assert.deepEqual(fuzzySynonymGroups(["basquet"]).map((g) => g.includes("basket")), [true]);
  assert.deepEqual(fuzzySynonymGroups(["tote"]), [], "an unrelated word stays unmatched");
});

test("fuzzy product score counts query words close to a name or alias word", () => {
  assert.equal(fuzzyScore(["kapucho"], "Hoodie noir", "kapuchon, sweat"), 1);
  assert.equal(fuzzyScore(["kapucho"], "Casquette noire", "cap"), 0);
});
