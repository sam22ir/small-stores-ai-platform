import type { SupabaseClient } from "@supabase/supabase-js";
import type { HandleInboundInput, HandleInboundResult, StoreSettings } from "../pipeline.ts";
import type { InboundEvent } from "./webhook.ts";

// One customer message arriving from Meta, from "stored" to "answered and delivered".
//   1. find the connected account (and so the store) the message was sent to,
//   2. store the customer, conversation and message (a retried delivery finds the same message),
//   3. run the assistant (debounced, locked, limited: see handleInbound),
//   4. deliver the reply to Instagram,
//   5. best effort: learn the customer's name so the owner doesn't see a number.

export const WEBHOOK_DEBOUNCE_MS = 4000;

export interface IngestDeps {
  db: SupabaseClient;
  env: (key: string) => string | undefined;
  handle: (input: HandleInboundInput) => Promise<HandleInboundResult>;
  deliver: (conversationId: string) => Promise<unknown>;
  // Returns a display name for a customer, or null. Failures are ignored.
  lookupName?: (channelId: string, senderId: string) => Promise<string | null>;
  debounceMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

export type IngestOutcome = "no_channel" | "no_store" | "handled";

export async function ingestEvent(deps: IngestDeps, event: InboundEvent): Promise<IngestOutcome> {
  const { db } = deps;

  const { data: channel, error: chErr } = await db
    .from("channels")
    .select("id,store_id")
    .eq("platform", event.platform)
    .eq("external_id", event.externalId)
    .eq("status", "active")
    .maybeSingle();
  if (chErr) throw chErr;
  if (!channel) {
    console.warn(`No active channel for ${event.platform}:${event.externalId}`);
    return "no_channel";
  }

  const { data: store, error: storeErr } = await db
    .from("stores")
    .select("id,name,currency,business_info,agent_enabled,monthly_reply_limit,orders_enabled")
    .eq("id", channel.store_id)
    .maybeSingle();
  if (storeErr) throw storeErr;
  if (!store) return "no_store";

  const { data: customer, error: custErr } = await db
    .from("customers")
    .upsert(
      { store_id: store.id, channel_id: channel.id, platform_user_id: event.senderId },
      { onConflict: "channel_id,platform_user_id" },
    )
    .select("id,display_name")
    .single();
  if (custErr) throw custErr;

  const { data: conversation, error: convErr } = await db
    .from("conversations")
    .upsert(
      {
        store_id: store.id,
        channel_id: channel.id,
        customer_id: customer.id,
        last_customer_message_at: new Date(event.timestampMs).toISOString(),
      },
      { onConflict: "channel_id,customer_id" },
    )
    .select("id,status")
    .single();
  if (convErr) throw convErr;

  let inboundId: string;
  const { data: inserted, error: msgErr } = await db
    .from("messages")
    .insert({
      store_id: store.id,
      conversation_id: conversation.id,
      channel_id: channel.id,
      direction: "inbound",
      sender: "customer",
      body: event.text,
      platform_message_id: event.mid,
    })
    .select("id")
    .single();
  if (msgErr?.code === "23505") {
    // Meta retried a message we already stored. If its reply never went out, finish the job:
    // handleInbound skips it when it was answered already.
    const { data: existing, error: exErr } = await db
      .from("messages")
      .select("id")
      .eq("channel_id", channel.id)
      .eq("platform_message_id", event.mid)
      .maybeSingle();
    if (exErr) throw exErr;
    if (!existing) return "handled";
    inboundId = existing.id;
  } else if (msgErr) {
    throw msgErr;
  } else {
    inboundId = inserted.id;
  }

  const result = await deps.handle({
    db,
    env: deps.env,
    store: store as StoreSettings,
    channelId: channel.id,
    conversation,
    customerId: customer.id,
    inboundMessageId: inboundId,
    text: event.text,
    source: "customer",
    debounceMs: deps.debounceMs ?? WEBHOOK_DEBOUNCE_MS,
    sleep: deps.sleep,
  });
  if (!result.ok) console.error("assistant run failed for", conversation.id, result.error);

  // Deliver whatever is waiting, including a holding reply written after an outage.
  try {
    await deps.deliver(conversation.id);
  } catch (err) {
    console.error("delivery failed", err);
  }

  if (!customer.display_name && deps.lookupName) {
    try {
      const name = await deps.lookupName(channel.id, event.senderId);
      if (name) await db.from("customers").update({ display_name: name }).eq("id", customer.id);
    } catch (err) {
      console.warn("could not look up customer name", err instanceof Error ? err.message : err);
    }
  }
  return "handled";
}
