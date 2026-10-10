import type { HandleInboundInput, HandleInboundResult, OwnerAlert } from "./types.ts";
import { processLocked } from "./reply.ts";
import { sendOwnerAlerts } from "./alerts.ts";

// --- Reliability wrapper -----------------------------------------------------

const EMPTY_RESULT = {
  handoff: null,
  tool_calls: [] as string[],
  usage: { input_tokens: 0, output_tokens: 0 },
  model: null,
  provider: null,
  fell_back: false,
  fast_path: false,
  limited: false,
};

async function hasNewerInbound(input: HandleInboundInput): Promise<boolean> {
  const { data, error } = await input.db
    .from("messages")
    .select("id")
    .eq("conversation_id", input.conversation.id)
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw error;
  return !!data?.length && data[0].id !== input.inboundMessageId;
}

async function alreadyAnswered(input: HandleInboundInput): Promise<boolean> {
  const { data, error } = await input.db
    .from("agent_runs")
    .select("id")
    .eq("trigger_message_id", input.inboundMessageId)
    .limit(1);
  if (error) throw error;
  return !!data?.length;
}

// What runs for every customer message. It makes sure that, however many webhooks, retries or
// rapid-fire messages arrive, a chat gets one reply at a time and every message is answered:
//   1. wait briefly and let only the newest of a burst of messages through (debounce),
//   2. skip a message that already has a reply (webhook redelivery),
//   3. take a per-conversation lock so two replies can't be written at once,
//   4. re-check once the lock is held, because the world may have moved on while waiting.
export async function handleInbound(input: HandleInboundInput): Promise<HandleInboundResult> {
  const { db, store, conversation, source } = input;
  const sleep = input.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const silent = (note: string, status = "bot"): HandleInboundResult => ({
    ok: true,
    ...EMPTY_RESULT,
    reply: null,
    status,
    note,
  });

  if (conversation.status !== "bot") {
    return silent("Conversation is with the owner.", conversation.status);
  }
  if (source === "customer" && !store.agent_enabled) return silent("Assistant is turned off.");

  if ((input.debounceMs ?? 0) > 0) {
    await sleep(input.debounceMs!);
    if (await hasNewerInbound(input)) return silent("A newer message will be answered instead.");
  }
  if (await alreadyAnswered(input)) return silent("This message was already answered.");

  const alerts: OwnerAlert[] = [];
  const polls = Math.max(1, Math.ceil((input.lockWaitMs ?? 30_000) / 1000));
  let claimed = false;
  for (let i = 0; i < polls && !claimed; i++) {
    const { data, error } = await db.rpc("claim_conversation", {
      p_conversation_id: conversation.id,
      p_seconds: 90,
    });
    if (error) throw error;
    claimed = data === true;
    if (!claimed) await sleep(1000);
  }
  if (!claimed) return silent("Another reply is still in progress.");

  try {
    // The owner may have taken over, or more messages may have arrived, while we waited.
    const { data: fresh, error: freshErr } = await db
      .from("conversations")
      .select("status")
      .eq("id", conversation.id)
      .maybeSingle();
    if (freshErr) throw freshErr;
    if (fresh && fresh.status !== "bot") return silent("Conversation is with the owner.", fresh.status);
    if (await hasNewerInbound(input)) return silent("A newer message will be answered instead.");
    if (await alreadyAnswered(input)) return silent("This message was already answered.");
    const result = await processLocked(input, alerts);
    sendOwnerAlerts(input, alerts);
    return result;
  } finally {
    const { error } = await db.rpc("release_conversation", { p_conversation_id: conversation.id });
    if (error) console.error("release_conversation failed", error);
  }
}
