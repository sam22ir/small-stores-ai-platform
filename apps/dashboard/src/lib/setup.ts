import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// What the owner has done so far, from data the dashboard can already read.
export type SetupData = { products: number; tested: boolean };

export const PRODUCTS_TARGET = 3;

export function useSetupData(): { data: SetupData | null; reload: () => Promise<void> } {
  const [data, setData] = useState<SetupData | null>(null);
  const reload = useCallback(async () => {
    const [p, r] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("source", "test"),
    ]);
    setData({ products: p.count ?? 0, tested: (r.count ?? 0) > 0 });
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
