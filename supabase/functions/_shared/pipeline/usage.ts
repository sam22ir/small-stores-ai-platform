import type { SupabaseClient } from "@supabase/supabase-js";
import { monthStartUtc, usageStatus, type UsageStatus } from "../agent/usage.ts";

const USAGE_PAGE = 1000;
export type UsageWithConversations = UsageStatus & { conversations: number };

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

// Billable replies this calendar month: customer-facing, answered by the model, not failed.
// `conversations` counts the distinct conversations those replies belong to.
export async function getUsage(
  db: SupabaseClient,
  storeId: string,
  limit: number,
  now = new Date(),
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
  for (let from = 0; ; from += USAGE_PAGE) {
    const { data, error: convErr } = await db
      .from("agent_runs")
      .select("conversation_id")
      .eq("store_id", storeId)
      .eq("source", "customer")
      .eq("fast_path", false)
      .is("error", null)
      .gte("created_at", since)
      .order("id", { ascending: true })
      .range(from, from + USAGE_PAGE - 1);
    if (convErr) throw convErr;
    const rows = (data ?? []) as { conversation_id: string }[];
    for (const r of rows) conversationIds.add(r.conversation_id);
    if (rows.length < USAGE_PAGE) break;
  }
  return { ...usageStatus(count ?? 0, limit), conversations: conversationIds.size };
}
