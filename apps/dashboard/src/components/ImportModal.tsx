import { useMemo, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, TextArea } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { groupRows, parseImport } from "../lib/importer";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { CountUp } from "./wakil/CountUp";
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
  const reduced = useMotionSafe();
  const fileRef = useRef<HTMLInputElement>(null);
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

  const total = result ? result.added + result.updated : 0;

  return (
    <Modal title={t("import.title")} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="m-0 text-sm text-soft">{t("import.help")}</p>
        <TextArea
          value={text}
          rows={6}
          dir="ltr"
          aria-label={t("import.title")}
          placeholder={t("import.placeholder")}
          onChange={(e) => setText(e.target.value)}
          className="w-full font-mono text-sm"
        />
        <input ref={fileRef} type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" tabIndex={-1}
          onChange={(e) => void onFile(e.target.files?.[0])} />
        <Button variant="outline" size="sm" className="self-start" onPress={() => fileRef.current?.click()}>
          {t("import.upload")}
        </Button>

        {text.trim() && (
          <div className="flex flex-col gap-2 rounded-wakil border-2 border-ink/15 bg-surface-secondary p-3 text-sm" aria-live="polite">
            <div className="font-bold text-ink">{t("import.preview", { products: groups.length, options: optionCount })}</div>
            <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
              <AnimatePresence initial={false}>
                {groups.map((g, i) => (
                  <m.li
                    key={g.name}
                    layout={!reduced}
                    initial={reduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={reduced ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: dur.short, ease: ease.out, delay: reduced ? 0 : Math.min(i * 0.04, 0.3) }}
                    className="flex items-center justify-between gap-2 rounded-wakil-sm bg-slip px-2.5 py-1.5"
                  >
                    <span className="min-w-0 truncate font-semibold text-ink">{g.name}</span>
                    <span className="shrink-0 text-xs text-soft tabular-nums">{g.options.length}</span>
                  </m.li>
                ))}
              </AnimatePresence>
            </ul>
            {parsed.errors.length > 0 && (
              <div className="text-red">
                {t("import.errors", { n: parsed.errors.length, lines: parsed.errors.slice(0, 10).map((e) => e.line).join(", ") })}
              </div>
            )}
          </div>
        )}

        {result && (
          <m.div
            role="status"
            initial={reduced ? false : { opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: dur.short, ease: ease.out }}
            className="flex flex-col gap-1 rounded-wakil border-2 border-ink bg-slip p-3 text-sm text-ink shadow-ink-sm"
          >
            <CountUp to={total} className="text-[28px] font-extrabold leading-none text-ink" />
            <span>{t("import.done", { added: result.added, updated: result.updated })}</span>
            {result.noPrice > 0 && <span className="text-soft">{t("import.noPrice", { n: result.noPrice })}</span>}
          </m.div>
        )}
        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onPress={onClose}>{t("common.cancel")}</Button>
          <Button variant="primary" isDisabled={busy || groups.length === 0 || !!result} onPress={() => void run()}>{t("import.run")}</Button>
        </div>
      </div>
    </Modal>
  );
}
