import type { SupabaseClient } from "@supabase/supabase-js";
import {
  monthStartUtc,
  tokenCapStatus,
  usageStatus,
  type TokenCapStatus,
  type UsageStatus,
} from "../agent/usage.ts";

const USAGE_PAGE = 1000;
export type UsageWithConversations = UsageStatus & {
  conversations: number;
  tokens: TokenCapStatus;
};

// Facts from the successful lookups (search, stock, delivery quotes) of this chat's last few runs,
// so a later turn still knows the variant ids, prices and fees. Oldest first. A failed read only
// costs the facts, never the reply.
const LOOKUP_RUNS = 5;
export async function loadLookups(db: SupabaseClient, conversationId: string): Promise<string[]> {
  const { data, error } = await db
    .from("agent_runs")
    .select("tool_calls,error")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(LOOKUP_RUNS);
  if (error) {
    console.error("loading lookups failed", error.message);
    return [];
  }
  const lines: string[] = [];
  // A run that failed never reached the customer, so its lookups don't count.
  const runs = ((data ?? []) as { tool_calls?: unknown; error?: unknown }[]).filter((r) => !r.error);
  for (const run of runs.reverse()) {
    const calls = Array.isArray(run.tool_calls) ? run.tool_calls as { output?: unknown }[] : [];
    for (const c of calls) {
      if (typeof c.output === "string" && c.output && !lines.includes(c.output)) lines.push(c.output);
    }
  }
  return lines;
}

// Marks this store's token-cap alert as sent for the current month. Returns true only the first time,
// so the owner hears about a cap once per month. A failed check sends nothing rather than spamming.
export async function claimCapAlert(db: SupabaseClient, storeId: string, now = new Date()): Promise<boolean> {
  const month = monthStartUtc(now).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("store_ai_cap_alerts")
    .select("store_id")
    .eq("store_id", storeId)
    .eq("month", month)
    .maybeSingle();
  if (error) {
    console.error("cap alert check failed", error.message);
    return false;
  }
  if (data) return false;
  const { error: insErr } = await db.from("store_ai_cap_alerts").insert({ store_id: storeId, month });
  if (insErr) {
    if (insErr.code !== "23505") console.error("cap alert claim failed", insErr.message);
    return false; // 23505: another request claimed it first
  }
  return true;
}

// Billable replies this calendar month: customer-facing, answered by the model, not failed.
// `conversations` counts the distinct conversations those replies belong to.
export async function getUsage(
  db: SupabaseClient,
  storeId: string,
  limit: number,
  now = new Date(),
  tokenLimit: number | null = null,
): Promise<UsageWithConversations> {
  const since = monthStartUtc(now).toISOString();
  const { count, error } = await db
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("store_id", storeId)
    .eq("source", "customer")
    .eq("fast_path", false)
    .is("error", null)
    .gte("created_at", since);
  if (error) throw error;

  const conversationIds = new Set<string>();
  let tokensUsed = 0;
  for (let from = 0; ; from += USAGE_PAGE) {
    const { data, error: convErr } = await db
      .from("agent_runs")
      .select("conversation_id,input_tokens,output_tokens")
      .eq("store_id", storeId)
      .eq("source", "customer")
      .eq("fast_path", false)
      .is("error", null)
      .gte("created_at", since)
      .order("id", { ascending: true })
      .range(from, from + USAGE_PAGE - 1);
    if (convErr) throw convErr;
    const rows = (data ?? []) as {
      conversation_id: string;
      input_tokens?: number | null;
      output_tokens?: number | null;
    }[];
    for (const r of rows) {
      conversationIds.add(r.conversation_id);
      tokensUsed += (r.input_tokens ?? 0) + (r.output_tokens ?? 0);
    }
    if (rows.length < USAGE_PAGE) break;
  }
  return {
    ...usageStatus(count ?? 0, limit),
    conversations: conversationIds.size,
    tokens: tokenCapStatus(tokensUsed, tokenLimit),
  };
}
