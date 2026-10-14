import assert from "node:assert/strict";
import { test } from "node:test";
import { CORRECTION_MARK, languageMismatch } from "../agent/language.ts";
import type { AgentResult, ChatMessage } from "../agent/types.ts";
import { replyWithScriptCheck } from "./reply.ts";

// Replies and customer turns are the full texts of the stress cases (results-after-full.jsonl).
const ok = (reply: string): AgentResult => ({
  reply,
  handoffReason: null,
  handoffSummary: null,
  toolCalls: [],
  usage: { input_tokens: 1, output_tokens: 1 },
  model: "test",
});

// Feeds the given replies in order and records the turns of every call.
function replies(...texts: string[]) {
  const calls: ChatMessage[][] = [];
  const call = (turns: ChatMessage[]) => {
    calls.push(turns);
    return Promise.resolve(ok(texts[calls.length - 1] ?? ""));
  };
  return { call, calls };
}

// PS-012: Latin-letter Darija all along; the third reply switched to French.
const PS012: ChatMessage[] = [
  { role: "user", text: "salam" },
  { role: "assistant", text: "Salam, mar7ba bik f algeria testing account! Kifach n9der n3awnek?" },
  { role: "user", text: "wach kayen sbadri 42?" },
  { role: "assistant", text: "Iyyeh, Basket blanche kayna taille 42 b 6500 DA, ba9i ghir chwiya. T7eb tcommandi?" },
  { role: "user", text: "w 43?" },
];
const PS012_REPLY = "La taille 43 mahech disponible actuellement. Vous voulez vérifier une autre taille?";

// PS-036: English customer, the reply came back in French.
const PS036: ChatMessage[] = [{ role: "user", text: "jean slim 42 in stock?" }];
const PS036_REPLY = "Non, le jean slim bleu en taille 42 n’est pas disponible pour le moment. Il coûte 4 200 DZD. Vous voulez vérifier une autre taille ?";

test("PS-012: a Darija conversation answered in French is sent back once for a Darija reply", async () => {
  const { call, calls } = replies(PS012_REPLY, "Taille 43 mahech kayna. Bghiti taille 42 ola chi resta?");
  const out = await replyWithScriptCheck(PS012, call);
  assert.equal(calls.length, 2);
  const note = calls[1].at(-1)!;
  assert.equal(note.role, "user");
  assert.ok(note.text.startsWith(CORRECTION_MARK));
  assert.match(note.text, /Algerian Darija in Latin letters/);
  assert.equal(out.reply, "Taille 43 mahech kayna. Bghiti taille 42 ola chi resta?");
});

test("PS-036: an English customer answered in French is sent back once for English", async () => {
  const { call, calls } = replies(PS036_REPLY, "No, the slim blue jean in size 42 is not available right now. Want another size?");
  const out = await replyWithScriptCheck(PS036, call);
  assert.equal(calls.length, 2);
  assert.match(calls[1].at(-1)!.text, /Rewrite the reply in English/);
  assert.match(out.reply, /^No, the slim blue jean/);
});

test("the retry is sent even if it is still in the wrong language", async () => {
  const { call, calls } = replies(PS036_REPLY, PS036_REPLY);
  const out = await replyWithScriptCheck(PS036, call);
  assert.equal(calls.length, 2);
  assert.equal(out.reply, PS036_REPLY);
});

test("languageMismatch is confident only with 3 words of the other language and none of the customer's", () => {
  assert.equal(languageMismatch(PS012_REPLY, "dz"), "fr");
  assert.equal(languageMismatch(PS036_REPLY, "en"), "fr");
  // Customer words in the reply: no retry.
  assert.equal(languageMismatch("Kayna, la taille 42 b 6500 DA, vous voulez?", "dz"), null);
  // Two French words are not enough.
  assert.equal(languageMismatch("La taille 43 mahech disponible.", "dz"), null);
  assert.equal(languageMismatch("", "dz"), null);
  assert.equal(languageMismatch(PS036_REPLY, null), null);
});

// Real replies that were NOT a language drift in the stress run: they must not be retried.
const NOT_DRIFT: { name: string; history: ChatMessage[]; reply: string }[] = [
  {
    name: "OR-003 turn 2: Darija reply with French address words (commune, rue, détails)",
    history: [
      { role: "user", text: "bghit 2 hoodie noir taille M" },
      { role: "assistant", text: "Hoodie noir taille M kayen ghi chwiya, b 3500 DA. Bach tcommandi 2, sifti liya smitek kamla, numéro téléphone, wilaya w l’adresse kamla." },
      { role: "user", text: "smiti Ilyes Mezian, 0770123456, Constantine" },
    ],
    reply: "Merci Ilyes, Constantine livraison 700 DA. Sifet liya l’adresse kamla (commune, rue w détails) bach nkemel talab.",
  },
  {
    name: "OR-003 turn 3: summary with French labels inside a Darija chat",
    history: [{ role: "user", text: "cite Zouaghi 200 logts bt B n 3" }],
    reply: "• Hoodie noir taille M × 2 : 7000 DA\n• Livraison à Constantine : 700 DA\n• Total à payer à la livraison : 7700 DA\n\nTconfirme la commande ?",
  },
  {
    name: "OR-009 turn 3: Darija asking for the address",
    history: [{ role: "user", text: "0770123456 w ana f Annaba, hay Seket Ghrib" }],
    reply: "B9a ghir l’adresse kamla: commune, rue w ay détail y3awen livreur yel9ak. Seket Ghrib wa7dha ma tkafich.",
  },
  {
    name: "OR-050 turn 4: Darija clarification with the French word détails",
    history: [{ role: "user", text: "iyeh confirmi" }],
    reply: "Ma fhemtch l’adresse kamla: “Hay El Nasr, bt 7” bark. Sifetli esm l’commune w chari3/détails bach n9der n3ard 3lik résumé ta3 commande.",
  },
  {
    name: "Darija reply that mixes French product words",
    history: [{ role: "user", text: "bghit basket pointure 41" }],
    reply: "Basket blanche taille 41 kayna, le prix 6500 DA. Bghiti tcommandi?",
  },
  {
    name: "Darija reply with product names and a French shop phrase",
    history: [{ role: "user", text: "wach kayen hoodie noir?" }],
    reply: "Hoodie noir taille M kayna b 3500 DA, bghiti tcommandi? Le stock: 3 pièces.",
  },
];

for (const c of NOT_DRIFT) {
  test(`not retried: ${c.name}`, async () => {
    const { call, calls } = replies(c.reply);
    const out = await replyWithScriptCheck(c.history, call);
    assert.equal(calls.length, 1);
    assert.equal(out.reply, c.reply);
  });
}

test("a French conversation with a normal French reply is not retried", async () => {
  const { call, calls } = replies("Oui, le jean est disponible en taille 42, pour 4200 DA. Vous voulez commander ?");
  await replyWithScriptCheck([{ role: "user", text: "Je veux le jean taille 42 s'il vous plaît" }], call);
  assert.equal(calls.length, 1);
});
