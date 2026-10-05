import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { test } from "node:test";
import { parseWebhook, validSignature } from "./webhook.ts";

const ig = (messaging: unknown[], entryId = "17841445084837990") => ({
  object: "instagram",
  entry: [{ id: entryId, time: 1700000000000, messaging }],
});
const msg = (over: Record<string, unknown> = {}, sender = "cust-1") => ({
  sender: { id: sender },
  recipient: { id: "17841445084837990" },
  timestamp: 1700000000123,
  message: { mid: "mid-1", text: "Do you have the black hoodie?", ...over },
});

test("a customer's text message becomes one event", () => {
  const [e] = parseWebhook(ig([msg()]));
  assert.deepEqual(e, {
    platform: "instagram",
    externalId: "17841445084837990",
    senderId: "cust-1",
    mid: "mid-1",
    text: "Do you have the black hoodie?",
    timestampMs: 1700000000123,
  });
});

test("our own sends (echoes), self messages, deletions and the account itself are ignored", () => {
  assert.deepEqual(parseWebhook(ig([msg({ is_echo: true })])), []);
  assert.deepEqual(parseWebhook(ig([msg({ is_self: true })])), []);
  assert.deepEqual(parseWebhook(ig([msg({ is_deleted: true })])), []);
  assert.deepEqual(parseWebhook(ig([msg({}, "17841445084837990")])), []);
  assert.deepEqual(parseWebhook(ig([{ sender: { id: "c" }, read: { mid: "x" } }])), []);
});

test("non-text messages are labelled so the assistant knows what arrived", () => {
  const label = (type: string) => parseWebhook(ig([msg({ text: undefined, attachments: [{ type }] })]))[0].text;
  assert.equal(label("audio"), "[voice message]");
  assert.equal(label("image"), "[image]");
  assert.equal(label("ig_reel"), "[shared reel]");
  assert.equal(label("something_new"), "[attachment]");
  assert.equal(parseWebhook(ig([msg({ text: undefined })]))[0].text, "[attachment]");
});

test("batches, Facebook pages and unknown objects", () => {
  const body = ig([msg({ mid: "a" }), msg({ mid: "b", text: "hi" }, "cust-2")]);
  assert.deepEqual(parseWebhook(body).map((e) => e.mid), ["a", "b"]);
  assert.equal(parseWebhook({ ...body, object: "page" })[0].platform, "facebook");
  assert.deepEqual(parseWebhook({ object: "whatsapp_business_account", entry: [] }), []);
  assert.deepEqual(parseWebhook(null), []);
});

test("signatures: valid with either configured secret, otherwise rejected", async () => {
  const raw = JSON.stringify(ig([msg()]));
  const sign = (secret: string) => `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  assert.ok(await validSignature(raw, sign("fb-secret"), ["fb-secret", "ig-secret"]));
  assert.ok(await validSignature(raw, sign("ig-secret"), [undefined, "ig-secret"]));
  assert.ok(!await validSignature(raw, sign("wrong"), ["fb-secret", "ig-secret"]));
  assert.ok(!await validSignature(raw + " ", sign("ig-secret"), ["ig-secret"]));
  assert.ok(!await validSignature(raw, null, ["ig-secret"]));
  assert.ok(!await validSignature(raw, "sha256=zz", ["ig-secret"]));
  assert.ok(!await validSignature(raw, sign("ig-secret"), [undefined, ""])); // no secret configured
});
