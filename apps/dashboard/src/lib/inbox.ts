import { supabase } from "./supabase";

export type InboxStatus = "human" | "bot" | "closed";

// One chat in the inbox list, as returned by the inbox_list RPC (migration 0024).
export type InboxRow = {
  id: string;
  status: InboxStatus;
  handoff_reason: string | null;
  last_customer_message_at: string | null;
  created_at: string;
  customer_name: string | null;
  platform_user_id: string;
  platform: string;
  last_body: string | null;
  last_direction: string | null;
  last_message_at: string | null;
};

// Keyset cursor: the last row of the previous page.
export type InboxCursor = { at: string | null; id: string };

export const INBOX_PAGE = 50;
const RPC_MAX = 100; // inbox_list caps p_limit at 100

// Up to `want` chats after `from` (the first chats when null), newest customer message first.
// Test chats (playground channel) are excluded by the RPC. `hasMore` is true when the last chunk was full.
export async function fetchInboxRows(
  storeId: string,
  status: InboxStatus | null,
  search: string,
  want: number,
  from: InboxCursor | null,
): Promise<{ rows: InboxRow[]; hasMore: boolean }> {
  const out: InboxRow[] = [];
  let cursor = from;
  let full = true;
  while (out.length < want) {
    const limit = Math.min(RPC_MAX, want - out.length);
    const { data, error } = await supabase.rpc("inbox_list", {
      p_store_id: storeId,
      p_status: status,
      p_search: search || null,
      p_limit: limit,
      p_before_at: cursor?.at ?? null,
      p_before_id: cursor?.id ?? null,
    });
    if (error) throw error;
    const rows = (data ?? []) as InboxRow[];
    out.push(...rows);
    full = rows.length === limit;
    if (!full || rows.length === 0) break;
    const last = rows[rows.length - 1];
    cursor = { at: last.last_customer_message_at, id: last.id };
  }
  return { rows: out, hasMore: full };
}

// How many chats have this status. A count only: no rows are fetched. Test chats are not counted.
export async function countConversations(storeId: string, status: InboxStatus): Promise<number | null> {
  const { count, error } = await supabase.from("conversations")
    .select("id, channels!inner(platform)", { count: "exact", head: true })
    .eq("store_id", storeId).eq("status", status).neq("channels.platform", "playground");
  return error ? null : (count ?? 0);
}
