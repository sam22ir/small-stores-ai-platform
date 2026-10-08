import assert from "node:assert/strict";
import { test } from "node:test";
import { fastPathReply } from "./fastpath.ts";

const S = "Demo Boutique";

test("greetings get a localized welcome", () => {
  assert.match(fastPathReply("Hello!", S)!, /welcome to Demo Boutique/);
  assert.match(fastPathReply("heyyy", S)!, /welcome/);
  assert.match(fastPathReply("Bonjour", S)!, /Bonjour et bienvenue chez Demo Boutique/);
  assert.match(fastPathReply("salut 👋", S)!, /Bonjour/);
  assert.match(fastPathReply("السلام عليكم", S)!, /أهلاً وسهلاً بك في Demo Boutique/);
  assert.match(fastPathReply("سلام", S)!, /أهلاً/);
});

test("Latin-script Darija greetings are answered in Latin-script Darija, not French", () => {
  for (const t of ["salam", "Slm", "salaaaam", "Salam alaykoum", "ahlan", "marhba", "salam 3alaykoum", "salam alikoum"]) {
    assert.equal(fastPathReply(t, S), "Salam, mar7ba bik f Demo Boutique! Kifach n9der n3awnek?", t);
  }
  assert.match(fastPathReply("salam", S) ?? "", /Salam, mar7ba bik/);
});

test("French greetings in Latin letters stay French", () => {
  for (const t of ["slt", "bjr", "BSR!", "salut"]) {
    assert.match(fastPathReply(t, S) ?? "", /Bonjour et bienvenue/, t);
  }
});

test("thanks get a closing reply, and win over a greeting", () => {
  assert.match(fastPathReply("thanks!", S)!, /You're welcome/);
  assert.match(fastPathReply("Merci beaucoup", S)!, /Avec plaisir/);
  assert.match(fastPathReply("choukran", S)!, /Bla mochkil/);
  assert.match(fastPathReply("saha", S)!, /Bla mochkil/);
  assert.match(fastPathReply("ya3tik saha", S)!, /Bla mochkil/);
  assert.match(fastPathReply("merci bzaf", S)!, /Bla mochkil/);
  assert.match(fastPathReply("شكرا", S)!, /العفو/);
  assert.match(fastPathReply("بارك الله فيك", S)!, /العفو/);
  assert.match(fastPathReply("salam merci", S)!, /Avec plaisir/);
});

test("anything with real content goes to the agent", () => {
  for (
    const t of [
      "hello do you have the black hoodie?",
      "bonjour combien coûte le sac",
      "salam wach kayen hoodie",
      "thanks, and the price?",
      "السلام عليكم كم سعر القميص",
      "",
      "   ",
      "😀",
      "a".repeat(80),
    ]
  ) {
    assert.equal(fastPathReply(t, S), null, t);
  }
});

test("confirmations are never fast-pathed (they confirm an order)", () => {
  for (const t of ["ok", "oui", "yes", "d'accord", "ماشي", "confirm", "wakha"]) {
    assert.equal(fastPathReply(t, S), null, t);
  }
});

test("common spelling variants of the greeting are free too", () => {
  // "salam alaykum" to a woman or a group, to one person, and with the Darija digit 3 for ع.
  for (const t of ["سلام عليكن", "السلام عليكن", "السلام عليك", "السلام عليكي", "السلام", "اهلين", "هلا والله"]) {
    assert.match(fastPathReply(t, S) ?? "", /أهلاً وسهلاً بك في Demo Boutique/, t);
  }
  for (const t of ["Salam 3alikom", "salam alikoum"]) {
    assert.match(fastPathReply(t, S) ?? "", /mar7ba bik/, t);
  }
});

test("more ways to say thanks", () => {
  for (const t of ["يعطيك الصحة", "الله يعطيك الصحة", "تسلم", "جزاك الله"]) assert.match(fastPathReply(t, S) ?? "", /العفو/, t);
  for (const t of ["mrc", "merci bcp"]) assert.match(fastPathReply(t, S) ?? "", /Avec plaisir/, t);
  assert.match(fastPathReply("jazak allah khair", S) ?? "", /Bla mochkil/);
  assert.match(fastPathReply("thank u", S) ?? "", /You're welcome/);
});

test("a greeting with a question still goes to the assistant, in every variant", () => {
  for (const t of ["سلام عليكن كم سعر الهودي", "السلام عليك هل عندكم كبوسة", "slt wach kayen hoodie", "bjr le prix du sac svp"]) {
    assert.equal(fastPathReply(t, S), null, t);
  }
});
