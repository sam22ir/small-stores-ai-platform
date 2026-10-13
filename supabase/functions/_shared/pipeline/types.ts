import type { SupabaseClient } from "@supabase/supabase-js";
import type { StoreContext } from "../agent/types.ts";

export type RunSource = "customer" | "test" | "dev";

export interface StoreSettings extends StoreContext {
  agent_enabled: boolean;
  monthly_reply_limit: number;
  ai_monthly_token_limit?: number | null; // null = unlimited
  // Bought replies left over (see 0023_reply_credits.sql). Used once the monthly allowance is spent.
  reply_credits?: number;
  // Subscription state (see _shared/billing.ts). Missing = not enforced.
  trial_ends_at?: string | null;
  paid_until?: string | null;
  billing_alerted_for?: string | null;
}

export interface HandleInboundInput {
  db: SupabaseClient;
  env: (key: string) => string | undefined;
  store: StoreSettings;
  channelId: string;
  conversation: { id: string; status: string };
  customerId: string;
  inboundMessageId: string;
  text: string;
  source: RunSource;
  now?: Date;
  // Customers often send several short messages in a row. With debounceMs > 0 the run waits
  // that long and answers only the newest message, once. Dashboard test chats use 0.
  debounceMs?: number;
  lockWaitMs?: number; // how long to wait for another reply in the same chat to finish
  sleep?: (ms: number) => Promise<void>; // injectable for tests
  // Sends an owner alert (default: Telegram via notifyOwner). Injectable for tests.
  notify?: (storeId: string, text: string) => Promise<unknown>;
}

// Things the owner should hear about, collected during a run and sent after the reply is stored.
export type OwnerAlert =
  | { kind: "handoff"; reason: string; summary?: string | null }
  | { kind: "limit" }
  | { kind: "token_cap" }
  | { kind: "billing" }
  | { kind: "degraded" }
  | { kind: "order"; total_cents: number };

export type HandleInboundResult =
  | {
    ok: true;
    reply: string | null;
    status: string;
    handoff: string | null;
    note?: string;
    tool_calls: string[];
    usage: { input_tokens: number; output_tokens: number };
    model: string | null;
    provider: string | null;
    fell_back: boolean;
    fast_path: boolean;
    limited: boolean;
    degraded?: boolean; // the model was unavailable; the customer got a holding reply
  }
  | { ok: false; error: string };
