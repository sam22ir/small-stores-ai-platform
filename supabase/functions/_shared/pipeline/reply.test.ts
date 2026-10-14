import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentResult, ChatMessage } from "../agent/types.ts";
import { replyWithScriptCheck } from "./reply.ts";

const result = (reply: string, toolCalls: { name: string }[] = [], usage = { input_tokens: 10, output_tokens: 5 }) =>
  ({ reply, toolCalls, usage, handoffReason: null, handoffSummary: null, model: "test" }) as unknown as AgentResult;

const darijaHistory: ChatMessage[] = [{ role: "user", text: "bghit hoodie noir taille M" }];

test("G1 a Darija reply with Arabic letters is retried once with a correction, and the retry is sent", async () => {
  const calls: ChatMessage[][] = [];
  const replies = [result("Hoodie noir 3500 DA، المقاس M"), result("Hoodie noir 3500 DA, taille M kayna.")];
  const out = await replyWithScriptCheck(darijaHistory, async (turns) => {
    calls.push(turns);
    return replies[calls.length - 1];
  });
  assert.equal(calls.length, 2);
  assert.equal(out.reply, "Hoodie noir 3500 DA, taille M kayna.");
  const retryTurns = calls[1];
  assert.equal(retryTurns.at(-1)?.role, "user");
  assert.match(retryTurns.at(-1)?.text ?? "", /Arabic-script letters.*Latin letters/);
  assert.equal(retryTurns.at(-2)?.role, "assistant");
  // Tokens of both calls are counted.
  assert.deepEqual(out.usage, { input_tokens: 20, output_tokens: 10 });
});

test("G1 a second reply that is still wrong is sent anyway, after one retry", async () => {
  let calls = 0;
  const out = await replyWithScriptCheck(darijaHistory, async () => {
    calls++;
    return result("Hoodie noir المقاس M");
  });
  assert.equal(calls, 2);
  assert.equal(out.reply, "Hoodie noir المقاس M");
});

test("G1 Cyrillic letters in an Arabic reply trigger the retry", async () => {
  const history: ChatMessage[] = [{ role: "user", text: "هل عندكم هودي أسود؟" }];
  const seen: string[] = [];
  const out = await replyWithScriptCheck(history, async (turns) => {
    seen.push(turns.at(-1)?.text ?? "");
    return result(seen.length === 1 ? "نعم، لدينا هودي Черный" : "نعم، لدينا هودي أسود");
  });
  assert.equal(seen.length, 2);
  assert.match(seen[1], /Cyrillic letters/);
  assert.equal(out.reply, "نعم، لدينا هودي أسود");
});

test("G1 a clean reply is not retried", async () => {
  let calls = 0;
  const out = await replyWithScriptCheck(darijaHistory, async () => {
    calls++;
    return result("Hoodie noir 3500 DA, taille M kayna.");
  });
  assert.equal(calls, 1);
  assert.equal(out.reply, "Hoodie noir 3500 DA, taille M kayna.");
});

test("G1 no retry after an order was created, because the first run already changed the store", async () => {
  let calls = 0;
  await replyWithScriptCheck(darijaHistory, async () => {
    calls++;
    return result("Commande 3500 DA، شكرا", [{ name: "create_order" }]);
  });
  assert.equal(calls, 1);
});

test("G1 a handoff from the first run survives the retry, which may not repeat the tool call", async () => {
  let calls = 0;
  const first = { ...result("Hoodie noir المقاس M"), handoffReason: "Price haggling", handoffSummary: "Wants 1000 DA" };
  const out = await replyWithScriptCheck(darijaHistory, async () => {
    calls++;
    return calls === 1 ? (first as AgentResult) : result("Hoodie noir 3500 DA, kayna.");
  });
  assert.equal(calls, 2);
  assert.equal(out.reply, "Hoodie noir 3500 DA, kayna.");
  assert.equal(out.handoffReason, "Price haggling");
  assert.equal(out.handoffSummary, "Wants 1000 DA");
});

test("G1 a failed retry keeps the first reply instead of a degraded handoff", async () => {
  let calls = 0;
  const out = await replyWithScriptCheck(darijaHistory, async () => {
    calls++;
    if (calls === 2) throw new Error("provider down");
    return result("Hoodie noir المقاس M");
  });
  assert.equal(calls, 2);
  assert.equal(out.reply, "Hoodie noir المقاس M");
});
