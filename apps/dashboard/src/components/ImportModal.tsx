import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { groupRows, parseImport } from "../lib/importer";
import { Modal } from "./Modal";

type ExistingProduct = { id: string; name: string; product_variants: { id: string; label: string }[] };

// Paste a stock list from a spreadsheet: existing products (matched by name and option) get their
// stock updated, new ones are created. The fastest way to fix a whole catalog at once.
export function ImportModal({ storeId, existing, onClose, onDone }: {
  storeId: string;
  existing: ExistingProduct[];
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ added: number; updated: number; noPrice: number } | null>(null);

  const parsed = useMemo(() => parseImport(text), [text]);
  const groups = useMemo(() => groupRows(parsed.rows), [parsed]);
  const optionCount = groups.reduce((n, g) => n + g.options.length, 0);

  async function onFile(file: File | undefined) {
    if (file) setText(await file.text());
  }

  async function run() {
    setBusy(true); setError(null);
    const byName = new Map(existing.map((p) => [p.name.trim().toLowerCase(), p]));
    const defaultLabel = t("catalog.defaultOption");
    const now = new Date().toISOString();
    let added = 0, updated = 0, noPrice = 0;
    try {
      for (const g of groups) {
        const found = byName.get(g.name.trim().toLowerCase());
        if (found) {
          for (const o of g.options) {
            const label = o.label.trim().toLowerCase();
            const variant = label
              ? found.product_variants.find((v) => v.label.trim().toLowerCase() === label)
              : found.product_variants.length === 1 ? found.product_variants[0] : undefined;
            if (variant) {
              const patch: { stock_quantity?: number; price_cents?: number } = {};
              if (o.stock !== null) patch.stock_quantity = o.stock;
              if (o.priceCents !== null) patch.price_cents = o.priceCents;
              if (Object.keys(patch).length) {
                const { error: err } = await supabase.from("product_variants").update(patch).eq("id", variant.id);
                if (err) throw err;
              }
            } else {
              const { error: err } = await supabase.from("product_variants").insert({
                store_id: storeId, product_id: found.id, label: o.label || defaultLabel,
                stock_quantity: o.stock ?? 0, price_cents: o.priceCents,
              });
              if (err) throw err;
            }
          }
          const patch: { stock_checked_at: string; price_cents?: number; aliases?: string; description?: string } = { stock_checked_at: now };
          if (g.priceCents !== null) patch.price_cents = g.priceCents;
          if (g.aliases) patch.aliases = g.aliases;
          if (g.description) patch.description = g.description;
          const { error: err } = await supabase.from("products").update(patch).eq("id", found.id);
          if (err) throw err;
          updated++;
        } else {
          if (g.priceCents === null) { noPrice++; continue; }
          const { data, error: err } = await supabase.from("products").insert({
            store_id: storeId, name: g.name, price_cents: g.priceCents,
            description: g.description || null, aliases: g.aliases || null,
          }).select("id").single();
          if (err) throw err;
          const { error: vErr } = await supabase.from("product_variants").insert(
            g.options.map((o) => ({
              store_id: storeId, product_id: data.id, label: o.label || defaultLabel,
              stock_quantity: o.stock ?? 0, price_cents: o.priceCents,
            })),
          );
          if (vErr) throw vErr;
          added++;
        }
      }
      setResult({ added, updated, noPrice });
      await onDone();
    } catch {
      setError(t("common.error"));
    }
    setBusy(false);
  }

  return (
    <Modal title={t("import.title")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="muted text-sm m-0">{t("import.help")}</p>
        <textarea className="input font-mono text-sm" style={{ minHeight: 160 }} dir="ltr" value={text} aria-label={t("import.title")}
          onChange={(e) => setText(e.target.value)} placeholder={t("import.placeholder")} />
        <label className="btn btn-small self-start cursor-pointer">
          {t("import.upload")}
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>

        {text.trim() && (
          <div className="rounded-xl p-3 text-sm" style={{ background: "var(--surface-2)" }} aria-live="polite">
            <div className="font-semibold">{t("import.preview", { products: groups.length, options: optionCount })}</div>
            {parsed.errors.length > 0 && (
              <div className="mt-1" style={{ color: "var(--warn)" }}>
                {t("import.errors", { n: parsed.errors.length, lines: parsed.errors.slice(0, 10).map((e) => e.line).join(", ") })}
              </div>
            )}
          </div>
        )}

        {result && (
          <div className="rounded-xl p-3 text-sm" style={{ background: "var(--ok-bg)", color: "var(--ok-text)" }} role="status">
            {t("import.done", { added: result.added, updated: result.updated })}
            {result.noPrice > 0 && <div>{t("import.noPrice", { n: result.noPrice })}</div>}
          </div>
        )}
        {error && <p className="error m-0" role="alert">{error}</p>}

        <div className="flex justify-end gap-2">
          <button className="btn" onClick={onClose}>{t("common.cancel")}</button>
          <button className="btn btn-primary" disabled={busy || groups.length === 0 || !!result} onClick={() => void run()}>{t("import.run")}</button>
        </div>
      </div>
    </Modal>
  );
}
