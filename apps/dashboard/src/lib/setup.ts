import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";

// What the owner has done so far, from data the dashboard can already read.
export type SetupData = { products: number; tested: boolean; channels: number; carrier: boolean };

export const PRODUCTS_TARGET = 3;

// Whether Yalidine is connected for the store. Any error counts as not connected.
async function carrierConnected(storeId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("carrier_status", { p_store_id: storeId });
    if (error) return false;
    return (data as { connected?: boolean } | null)?.connected === true;
  } catch {
    return false;
  }
}

export function useSetupData(storeId: string): { data: SetupData | null; reload: () => Promise<void> } {
  const [data, setData] = useState<SetupData | null>(null);
  const reload = useCallback(async () => {
    const [p, r, c, carrier] = await Promise.all([
      supabase.from("products").select("id", { count: "exact", head: true }).eq("active", true),
      supabase.from("agent_runs").select("id", { count: "exact", head: true }).eq("source", "test"),
      supabase.from("channels").select("id", { count: "exact", head: true }).eq("status", "active").neq("platform", "playground"),
      carrierConnected(storeId),
    ]);
    setData({ products: p.count ?? 0, tested: (r.count ?? 0) > 0, channels: c.count ?? 0, carrier });
  }, [storeId]);
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
