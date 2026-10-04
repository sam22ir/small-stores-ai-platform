import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { supabase } from "./supabase";
import type { Database } from "./database.types";

export type Store = Database["public"]["Tables"]["stores"]["Row"];

type StoreState = {
  store: Store | null;
  loading: boolean;
  failed: boolean;
  refresh: () => Promise<void>;
};
const Ctx = createContext<StoreState>({ store: null, loading: true, failed: false, refresh: async () => {} });

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

  useEffect(() => { void refresh(); }, [refresh]);

  return <Ctx.Provider value={{ store, loading, failed, refresh }}>{children}</Ctx.Provider>;
}

export const useStore = () => useContext(Ctx);
