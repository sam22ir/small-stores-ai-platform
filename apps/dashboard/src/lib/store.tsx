import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type Store = Database["public"]["Tables"]["stores"]["Row"];

type StoreState = {
  store: Store | null;
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
  // Local-only update (optimistic UI); callers write to the database themselves.
  patchStore: (patch: Partial<Store>) => void;
};
const Ctx = createContext<StoreState>({ store: null, loading: true, failed: false, refresh: async () => {}, patchStore: () => {} });

// The signed-in user's store: their first membership. RLS means they can only ever see their own.
export function StoreProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const [store, setStore] = useState<Store | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const refresh = useCallback(async () => {
    const { data: member, error: mErr } = await supabase
      .from("store_members").select("store_id").eq("user_id", userId)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (mErr) { setFailed(true); setLoading(false); return; }
    if (!member) { setStore(null); setFailed(false); setLoading(false); return; }
    const { data: s, error: sErr } = await supabase
      .from("stores").select("*").eq("id", member.store_id).single();
    if (sErr) { setFailed(true); setLoading(false); return; }
    setStore(s); setFailed(false); setLoading(false);
  }, [userId]);

  const patchStore = useCallback((patch: Partial<Store>) => {
    setStore((s) => (s ? { ...s, ...patch } : s));
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return <Ctx.Provider value={{ store, loading, failed, refresh, patchStore }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);

// Calls `refresh` when rows of `table` that match `filter` change (Supabase realtime), so screens stay
// fresh without reloads. Polling is the fallback: every 60 s while the subscription is live, every 15 s
// when it is not (not subscribed yet, or realtime errored). Pass no filter to skip the subscription.
export function useRealtimeRefresh(table: string, filter: string | undefined, refresh: () => void) {
  const instance = useId().replace(/[^a-zA-Z0-9]/g, "");
  const refreshRef = useRef(refresh);
  const [live, setLive] = useState(false);

  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    if (!filter) return;
    let timer: number | undefined;
    // Unique channel name per hook instance: realtime-js shares channels that have the same topic.
    const channel = supabase
      .channel(`${table}-${filter.replace(/[^a-zA-Z0-9]/g, "")}-${instance}`)
      .on("postgres_changes", { event: "*", schema: "public", table, filter }, () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => refreshRef.current(), 300);
      })
      .subscribe((status) => setLive(status === "SUBSCRIBED"));
    return () => {
      window.clearTimeout(timer);
      setLive(false);
      void supabase.removeChannel(channel);
    };
  }, [table, filter, instance]);

  useEffect(() => {
    const id = window.setInterval(() => { if (!document.hidden) refreshRef.current(); }, live ? 60_000 : 15_000);
    return () => window.clearInterval(id);
  }, [live]);
}

// Conversations of one store (the inbox badge and list).
export function useConversationsRefresh(storeId: string | undefined, refresh: () => void) {
  useRealtimeRefresh("conversations", storeId ? `store_id=eq.${storeId}` : undefined, refresh);
}
