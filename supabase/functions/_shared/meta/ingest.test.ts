import assert from "node:assert/strict";
import { test } from "node:test";
import type { HandleInboundInput, HandleInboundResult } from "../pipeline.ts";
import { ingestEvent, WEBHOOK_DEBOUNCE_MS } from "./ingest.ts";
import { memDb, type Tables } from "../testing/memdb.ts";
import type { InboundEvent } from "./webhook.ts";

const event = (over: Partial<InboundEvent> = {}): InboundEvent => ({
  platform: "instagram",
  externalId: "17841445084837990",
  senderId: "igsid-1",
  mid: "mid-1",
  text: "Do you have the black hoodie in M?",
  timestampMs: Date.parse("2026-10-05T12:00:00Z"),
  ...over,
});

const ok: HandleInboundResult = {
  ok: true, reply: "yes", status: "bot", handoff: null, tool_calls: [], usage: { input_tokens: 0, output_tokens: 0 },
  model: null, provider: null, fell_back: false, fast_path: false, limited: false,
};

function setup() {
  const tables: Tables = {
    channels: [{ id: "ch1", store_id: "s1", platform: "instagram", external_id: "17841445084837990", status: "active" }],
    stores: [{ id: "s1", name: "Fennec", currency: "DZD", business_info: null, agent_enabled: true, monthly_reply_limit: 1000, orders_enabled: false }],
    customers: [], conversations: [], messages: [],
  };
  const handled: HandleInboundInput[] = [];
  const delivered: string[] = [];
  const deps = {
    db: memDb(tables, { messages: ["channel_id", "platform_message_id"] }),
    env: () => undefined,
    handle: (i: HandleInboundInput) => { handled.push(i); return Promise.resolve(ok); },
    deliver: (id: string) => { delivered.push(id); return Promise.resolve(); },
  };
  return { tables, handled, delivered, deps };
}

test("a new message creates the customer, conversation and message, then runs the assistant and delivers", async () => {
  const { tables, handled, delivered, deps } = setup();
  assert.equal(await ingestEvent(deps, event()), "handled");

  assert.equal(tables.customers.length, 1);
  assert.equal(tables.customers[0].platform_user_id, "igsid-1");
  assert.equal(tables.conversations[0].last_customer_message_at, "2026-10-05T12:00:00.000Z");
  assert.equal(tables.messages.length, 1);
  assert.equal(tables.messages[0].platform_message_id, "mid-1");
  assert.equal(tables.messages[0].sender, "customer");

  assert.equal(handled.length, 1);
  assert.equal(handled[0].source, "customer");
  assert.equal(handled[0].debounceMs, WEBHOOK_DEBOUNCE_MS);
  assert.equal(handled[0].store.id, "s1");
  assert.equal(handled[0].inboundMessageId, tables.messages[0].id);
  assert.deepEqual(delivered, [tables.conversations[0].id]);
});

test("a retried delivery doesn't duplicate the message but still finishes the job", async () => {
  const { tables, handled, deps } = setup();
  await ingestEvent(deps, event());
  await ingestEvent(deps, event());
  assert.equal(tables.messages.length, 1);
  assert.equal(handled.length, 2);
  assert.equal(handled[0].inboundMessageId, handled[1].inboundMessageId); // handleInbound skips an answered one
});

test("a late redelivery of an older message doesn't move last_customer_message_at backward", async () => {
  const { tables, deps } = setup();
  await ingestEvent(deps, event({ mid: "new", timestampMs: Date.parse("2026-10-05T12:00:00Z") }));
  await ingestEvent(deps, event({ mid: "old", timestampMs: Date.parse("2026-10-04T09:00:00Z") }));
  assert.equal(tables.conversations.length, 1);
  assert.equal(tables.conversations[0].last_customer_message_at, "2026-10-05T12:00:00.000Z");
  assert.equal(tables.messages.length, 2);
});

test("a newer message moves last_customer_message_at forward", async () => {
  const { tables, deps } = setup();
  await ingestEvent(deps, event({ mid: "a", timestampMs: Date.parse("2026-10-04T09:00:00Z") }));
  await ingestEvent(deps, event({ mid: "b", timestampMs: Date.parse("2026-10-05T12:00:00Z") }));
  assert.equal(tables.conversations[0].last_customer_message_at, "2026-10-05T12:00:00.000Z");
});

test("the same customer keeps one conversation; a second customer gets their own", async () => {
  const { tables, deps } = setup();
  await ingestEvent(deps, event({ mid: "a" }));
  await ingestEvent(deps, event({ mid: "b" }));
  await ingestEvent(deps, event({ mid: "c", senderId: "igsid-2" }));
  assert.equal(tables.conversations.length, 2);
  assert.equal(tables.messages.length, 3);
});

test("messages for an account that isn't connected (or was disconnected) are ignored", async () => {
  const { tables, handled, deps } = setup();
  assert.equal(await ingestEvent(deps, event({ externalId: "someone-else" })), "no_channel");
  tables.channels[0].status = "disconnected";
  assert.equal(await ingestEvent(deps, event()), "no_channel");
  assert.equal(handled.length, 0);
  assert.equal(tables.messages.length, 0);
});

test("a delivery failure doesn't fail the webhook; a name lookup fills in the customer", async () => {
  const { tables, deps } = setup();
  const r = await ingestEvent({
    ...deps,
    deliver: () => Promise.reject(new Error("instagram down")),
    lookupName: () => Promise.resolve("Amel B."),
  }, event());
  assert.equal(r, "handled");
  assert.equal(tables.customers[0].display_name, "Amel B.");
});

test("a failing name lookup is ignored, and a known name isn't looked up again", async () => {
  const { tables, deps } = setup();
  await ingestEvent({ ...deps, lookupName: () => Promise.reject(new Error("nope")) }, event());
  assert.equal(tables.customers[0].display_name ?? null, null);

  tables.customers[0].display_name = "Known";
  let looked = 0;
  await ingestEvent({ ...deps, lookupName: () => { looked++; return Promise.resolve("x"); } }, event({ mid: "mid-2" }));
  assert.equal(looked, 0);
});

test("photo links are stored as message attachments; text-only messages store none", async () => {
  const { tables, deps } = setup();
  await ingestEvent(deps, event({ mid: "photo", images: ["https://scontent.cdninstagram.com/a.jpg"] }));
  await ingestEvent(deps, event({ mid: "plain" }));
  const photo = tables.messages.find((m) => m.platform_message_id === "photo");
  const plain = tables.messages.find((m) => m.platform_message_id === "plain");
  assert.deepEqual(photo?.attachments, [{ type: "image", url: "https://scontent.cdninstagram.com/a.jpg" }]);
  assert.equal(plain && "attachments" in plain, false);
});
