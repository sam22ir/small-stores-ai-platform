import assert from "node:assert/strict";
import { test } from "node:test";
import type { AgentResult, ChatMessage } from "../agent/types.ts";
import { replyWithScriptCheck } from "./reply.ts";

const result = (reply: string, toolCalls: { name: string; is_error?: boolean }[] = []) =>
  ({ reply, toolCalls, usage: { input_tokens: 10, output_tokens: 5 }, handoffReason: null, handoffSummary: null, model: "test" }) as unknown as AgentResult;

const history: ChatMessage[] = [{ role: "user", text: "chhal kayen hoodie noir?" }];

test("a reply with stray Chinese characters is retried once and the retry is sent", async () => {
  const calls: ChatMessage[][] = [];
  const replies = ["Kayen, 3500 DA. 青青青", "Kayen, 3500 DA."];
  const call = (turns: ChatMessage[]) => {
    calls.push(turns);
    return Promise.resolve(result(replies[calls.length - 1]));
  };
  const r = await replyWithScriptCheck(history, call);
  assert.equal(calls.length, 2);
  assert.equal(r.reply, "Kayen, 3500 DA.");
  assert.match(calls[1].at(-1)!.text, /script the conversation does not use/);
});

test("a second reply that still has foreign letters is sent anyway, after one retry", async () => {
  let n = 0;
  const call = () => {
    n++;
    return Promise.resolve(result("Kayen 3500 DA. 青青青"));
  };
  const r = await replyWithScriptCheck(history, call);
  assert.equal(n, 2);
  assert.equal(r.reply, "Kayen 3500 DA. 青青青");
});

test("no retry after a successful create_order even when the reply has foreign letters", async () => {
  let n = 0;
  const call = () => {
    n++;
    return Promise.resolve(result("Commande reçue. 青青青", [{ name: "create_order" }]));
  };
  await replyWithScriptCheck(history, call);
  assert.equal(n, 1);
});

test("a stray VOICE label is removed before the reply is sent", async () => {
  const r = await replyWithScriptCheck(history, () => Promise.resolve(result("Kayen 3500 DA.\nVOICE: Tafaḍḍal.")));
  assert.equal(r.reply, "Kayen 3500 DA.\nTafaḍḍal.");
});
