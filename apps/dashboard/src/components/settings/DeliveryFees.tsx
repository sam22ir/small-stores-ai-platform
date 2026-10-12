import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Input, Label, TextField, toast } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../lib/motion";
import { centsToInput, formatMoney, parsePrice } from "../../lib/format";
import { WILAYAS } from "../../lib/wilayas";
import { CARD, SECTION_TITLE } from "./shared";

type Fee = { id: string; wilaya: string; fee_cents: number };

// The store's default fee is the most common configured fee (ties go to the lower fee), but only once it
// covers at least 2 wilayas: a lone fee is a custom fee, never a hidden default. The table only stores
// per-wilaya rows, so this is derived, not saved. Wilayas on the default are counted, not listed.
function defaultFeeOf(fees: Fee[]): number | null {
  const counts = new Map<number, number>();
  for (const f of fees) counts.set(f.fee_cents, (counts.get(f.fee_cents) ?? 0) + 1);
  let best: number | null = null;
  let bestCount = 0;
  for (const [cents, count] of counts) {
    if (count > bestCount || (count === bestCount && best !== null && cents < best)) { best = cents; bestCount = count; }
  }
  return bestCount >= 2 ? best : null;
}

// Delivery fees: one default fee, a short list of custom fees, and a select + amount row to add one.
// The assistant only quotes a fee for wilayas listed here.
export function DeliveryFees({ storeId, currency }: { storeId: string; currency: string }) {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [wilaya, setWilaya] = useState("");
  const [fee, setFee] = useState("");
  // null = the owner has not typed in the default field, so it follows the derived default.
  const [defaultInput, setDefaultInput] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("delivery_fees").select("id,wilaya,fee_cents").order("wilaya");
    if (err) { setFailed(true); return; }
    setFees(data); setFailed(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const all = fees ?? [];
  const taken = new Set(all.map((f) => f.wilaya.trim().toLowerCase()));
  const free = WILAYAS.filter((w) => !taken.has(w.toLowerCase()));
  const modeCents = defaultFeeOf(all);
  const shownDefault = defaultInput ?? (modeCents === null ? "" : centsToInput(modeCents));
  const customs = all.filter((f) => f.fee_cents !== modeCents);
  const listed = showAll ? all : customs;

  function fail(msg: string) { setError(msg); toast.danger(msg); }

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = wilaya.trim();
    const cents = parsePrice(fee);
    if (!name) { setError(t("fees.errWilaya")); return; }
    if (cents === null) { setError(t("fees.errFee")); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.from("delivery_fees").insert({ store_id: storeId, wilaya: name, fee_cents: cents });
    if (err) fail(t("common.error"));
    else { setWilaya(""); setFee(""); toast.success(t("common.saved")); await load(); }
    setBusy(false);
  }

  // Bulk: gives every wilaya without a fee the default amount. Existing rows are not changed.
  async function addAll() {
    const cents = parsePrice(shownDefault);
    if (cents === null) { setError(t("fees.errFee")); return; }
    const rows = free.map((w) => ({ store_id: storeId, wilaya: w, fee_cents: cents }));
    if (rows.length === 0) return;
    setBusy(true); setError(null);
    const { error: err } = await supabase.from("delivery_fees").insert(rows);
    if (err) fail(t("common.error")); else toast.success(t("common.saved"));
    await load();
    setBusy(false);
  }

  async function update(f: Fee, value: string) {
    const cents = parsePrice(value);
    if (cents === null) { fail(t("fees.errFee")); await load(); return; }
    if (cents === f.fee_cents) return;
    setError(null);
    const { error: err } = await supabase.from("delivery_fees").update({ fee_cents: cents }).eq("id", f.id);
    if (err) fail(t("common.error")); else toast.success(t("common.saved"));
    await load();
  }

  async function remove(f: Fee) {
    if (!window.confirm(t("settings.fees.confirmDelete"))) return;
    setError(null);
    const { error: err } = await supabase.from("delivery_fees").delete().eq("id", f.id);
    if (err) fail(t("common.error"));
    else setFees((rows) => rows && rows.filter((x) => x.id !== f.id));
    await load();
  }

  return (
    <section className={CARD} aria-labelledby="sec-fees">
      <div>
        <h2 id="sec-fees" className={SECTION_TITLE}>{t("fees.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("fees.help")}</p>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <TextField value={shownDefault} onChange={setDefaultInput} className="w-40">
          <Label>{t("fees.defaultLabel")}</Label>
          <Input id="fee-default" inputMode="decimal" />
        </TextField>
        <Button variant="outline" isDisabled={busy || free.length === 0} onPress={() => void addAll()}>{t("fees.addAll")}</Button>
      </div>
      {fees && all.length > 0 && modeCents !== null && (
        <p className="m-0 text-[13px] text-soft">{t("fees.summary", { n: all.length - customs.length, fee: formatMoney(modeCents, currency, lang) })}</p>
      )}

      <form onSubmit={add} className="flex flex-wrap items-end gap-2 border-t border-ink/10 pt-4">
        <label className="flex min-w-40 grow flex-col gap-1.5 text-sm font-semibold text-ink">
          {t("fees.wilaya")}
          <select id="fee-wilaya" value={wilaya} onChange={(e) => setWilaya(e.target.value)}
            className="min-h-11 rounded-wakil border-2 border-ink bg-slip px-3 text-[15px] font-medium text-ink">
            <option value="">{t("fees.pick")}</option>
            {free.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        </label>
        <TextField value={fee} onChange={setFee} className="w-32">
          <Label>{t("fees.amount")}</Label>
          <Input id="ff" inputMode="decimal" />
        </TextField>
        <Button type="submit" variant="primary" isDisabled={busy}>{t("fees.add")}</Button>
      </form>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      {failed && <Alert status="danger"><Alert.Content><Alert.Description>{t("common.error")}</Alert.Description></Alert.Content></Alert>}
      {fees && all.length === 0 && <p className="m-0 text-[13px] text-soft">{t("fees.empty")}</p>}

      {all.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-ink/10 pt-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="m-0 text-sm font-bold text-ink">{t("fees.custom")}</h3>
            {modeCents !== null && (
              <Button size="sm" variant="ghost" onPress={() => setShowAll((v) => !v)}>
                {showAll ? t("fees.showCustom") : t("fees.showAll", { n: all.length })}
              </Button>
            )}
          </div>
          {!showAll && customs.length === 0 && <p className="m-0 text-[13px] text-soft">{t("fees.noCustom")}</p>}
          <ul className="m-0 flex list-none flex-col p-0">
            <AnimatePresence initial={false}>
              {listed.map((f) => (
                <m.li
                  key={f.id}
                  layout={!reduced}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduced ? undefined : { opacity: 0, height: 0 }}
                  transition={{ duration: dur.short, ease: ease.out }}
                  className="flex items-center gap-2 border-b border-ink/10 py-1 last:border-b-0"
                >
                  <span className="min-w-0 grow truncate text-[15px] font-bold text-ink">{f.wilaya}</span>
                  <Input className="w-24" inputMode="decimal" defaultValue={centsToInput(f.fee_cents)} key={`${f.id}-${f.fee_cents}`}
                    aria-label={`${t("fees.fee")} ${f.wilaya} (${formatMoney(f.fee_cents, currency, lang)})`}
                    onBlur={(e) => void update(f, e.target.value)} />
                  <Button size="sm" variant="ghost" className="min-h-11 min-w-11 px-2 text-red" onPress={() => void remove(f)}>{t("fees.remove")}</Button>
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      )}
    </section>
  );
}
