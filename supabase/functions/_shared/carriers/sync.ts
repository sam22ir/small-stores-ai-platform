import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeWilaya, wilayaName } from "../agent/wilaya.ts";
import { decryptSecret } from "../meta/crypto.ts";
import { type FeeType, YalidineClient, YalidineError } from "./yalidine.ts";

export type SyncResult =
  | { ok: true; added: number; updated: number; skipped: number }
  | { ok: false; reason: "not_connected" | "currency_mismatch" | "bad_credentials" | "rate_limited" | "failed"; retryAfter?: number };

interface CarrierRow {
  api_id_encrypted: string;
  api_token_encrypted: string;
  from_wilaya_id: number;
  fee_type: FeeType;
}

// Copies Yalidine's delivery prices into the store's delivery_fees, which the agent and place_order already
// read. Fees the owner typed by hand (source = 'manual') are kept unless `overwrite` is set.
export async function syncYalidineFees(
  db: SupabaseClient,
  storeId: string,
  opts: { encryptionKey: string | undefined; overwrite?: boolean; client?: YalidineClient; now?: () => Date },
): Promise<SyncResult> {
  const now = opts.now ?? (() => new Date());
  const { data: store, error: storeErr } = await db.from("stores").select("currency").eq("id", storeId).maybeSingle();
  if (storeErr) throw storeErr;
  if (!store) return { ok: false, reason: "not_connected" };
  // Yalidine prices are in dinars. Writing them into a store that sells in euros would be silently wrong.
  if (store.currency !== "DZD") return { ok: false, reason: "currency_mismatch" };

  const { data: carrier, error: carrierErr } = await db
    .from("store_carriers")
    .select("api_id_encrypted,api_token_encrypted,from_wilaya_id,fee_type")
    .eq("store_id", storeId).eq("carrier", "yalidine").maybeSingle();
  if (carrierErr) throw carrierErr;
  if (!carrier) return { ok: false, reason: "not_connected" };
  const row = carrier as CarrierRow;

  const record = (error: string | null) =>
    db.from("store_carriers").update({
      last_error: error,
      ...(error === null ? { last_synced_at: now().toISOString() } : {}),
      updated_at: now().toISOString(),
    }).eq("store_id", storeId).eq("carrier", "yalidine");

  try {
    const client = opts.client ?? new YalidineClient({
      id: await decryptSecret(row.api_id_encrypted, opts.encryptionKey),
      token: await decryptSecret(row.api_token_encrypted, opts.encryptionKey),
    });
    const fees = await client.wilayaFees(row.from_wilaya_id, row.fee_type);

    const { data: existing, error: exErr } = await db.from("delivery_fees").select("id,wilaya,source").eq("store_id", storeId);
    if (exErr) throw exErr;
    const byCode = new Map<string, { id: string; source: string }>();
    for (const e of existing ?? []) {
      const code = normalizeWilaya(String(e.wilaya));
      if (code) byCode.set(code, { id: String(e.id), source: String(e.source) });
    }

    let added = 0, updated = 0, skipped = 0;
    for (const [wilayaId, feeDa] of fees) {
      const name = wilayaName(wilayaId);
      if (!name) continue;
      const feeCents = Math.round(feeDa * 100);
      const have = byCode.get(String(wilayaId).padStart(2, "0"));
      if (have) {
        if (have.source === "manual" && !opts.overwrite) { skipped++; continue; }
        const { error } = await db.from("delivery_fees").update({ fee_cents: feeCents, source: "yalidine" }).eq("id", have.id);
        if (error) throw error;
        updated++;
      } else {
        const { error } = await db.from("delivery_fees").insert({ store_id: storeId, wilaya: name, fee_cents: feeCents, source: "yalidine" });
        if (error) throw error;
        added++;
      }
    }
    await record(null);
    return { ok: true, added, updated, skipped };
  } catch (err) {
    if (err instanceof YalidineError) {
      const reason = err.status === 429 ? "rate_limited" : err.status === 401 || err.status === 403 ? "bad_credentials" : "failed";
      await record(reason);
      return { ok: false, reason, ...(err.retryAfter ? { retryAfter: err.retryAfter } : {}) };
    }
    await record("failed");
    throw err;
  }
}
