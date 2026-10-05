import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// What the owner has done so far, from data the dashboard can already read.
export type SetupData = { products: number; tested: boolean; channels: number };

export const PRODUCTS_TARGET = 3;

export function useSetupData(): { data: SetupData | null; reload: () => Promise<void> } {
  const [data, setData] = useState<SetupData | null>(null);
  const reload = useCallback(async () => {
    const [p, r, c] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("source", "test"),
      supabase.from("channels").select("id", { count: "exact", head: true }).eq("status", "active").neq("platform", "playground"),
    ]);
    setData({ products: p.count ?? 0, tested: (r.count ?? 0) > 0, channels: c.count ?? 0 });
  }, []);
  useEffect(() => { void reload(); }, [reload]);
  return { data, reload };
}

const hiddenKey = (storeId: string) => `setup-hidden-${storeId}`;

export function isSetupHidden(storeId: string): boolean {
  try { return localStorage.getItem(hiddenKey(storeId)) === "1"; } catch { return false; }
}

export function hideSetup(storeId: string): void {
  try { localStorage.setItem(hiddenKey(storeId), "1"); } catch { /* storage unavailable: it just comes back */ }
}
