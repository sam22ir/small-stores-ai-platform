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

// Per-wilaya delivery fees. The assistant only quotes a fee for wilayas listed here.
export function DeliveryFees({ storeId, currency }: { storeId: string; currency: string }) {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const [fees, setFees] = useState<Fee[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [wilaya, setWilaya] = useState("");
  const [fee, setFee] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error: err } = await supabase.from("delivery_fees").select("id,wilaya,fee_cents").order("wilaya");
    if (err) { setFailed(true); return; }
    setFees(data); setFailed(false);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const taken = new Set((fees ?? []).map((f) => f.wilaya.trim().toLowerCase()));

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
    else { setWilaya(""); toast.success(t("common.saved")); await load(); }
    setBusy(false);
  }

  async function addAll() {
    const cents = parsePrice(fee);
    if (cents === null) { setError(t("fees.errFee")); return; }
    const rows = WILAYAS.filter((w) => !taken.has(w.toLowerCase()))
      .map((w) => ({ store_id: storeId, wilaya: w, fee_cents: cents }));
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
    else setFees((all) => all && all.filter((x) => x.id !== f.id));
    await load();
  }

  return (
    <section className={CARD}>
      <div>
        <h2 className={SECTION_TITLE}>{t("fees.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("fees.help")}</p>
      </div>

      <form onSubmit={add} className="flex flex-wrap items-end gap-2">
        <TextField value={wilaya} onChange={setWilaya} maxLength={60} className="min-w-40 grow">
          <Label>{t("fees.wilaya")}</Label>
          <Input id="fw" list="wilayas" />
        </TextField>
        <datalist id="wilayas">{WILAYAS.filter((w) => !taken.has(w.toLowerCase())).map((w) => <option key={w} value={w} />)}</datalist>
        <TextField value={fee} onChange={setFee} className="w-32">
          <Label>{t("fees.defaultFee")} ({currency})</Label>
          <Input id="ff" inputMode="decimal" />
        </TextField>
        <Button type="submit" variant="primary" isDisabled={busy}>{t("fees.add")}</Button>
        <Button variant="outline" isDisabled={busy} onPress={() => void addAll()}>{t("fees.addAll")}</Button>
      </form>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      {failed && <Alert status="danger"><Alert.Content><Alert.Description>{t("common.error")}</Alert.Description></Alert.Content></Alert>}
      {fees && fees.length === 0 && <p className="m-0 text-[13px] text-soft">{t("fees.empty")}</p>}

      <ul className="m-0 flex list-none flex-col border-t border-ink/10 p-0">
        <AnimatePresence initial={false}>
          {(fees ?? []).map((f) => (
            <m.li
              key={f.id}
              layout={!reduced}
              initial={reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={reduced ? undefined : { opacity: 0, height: 0 }}
              transition={{ duration: dur.short, ease: ease.out }}
              className="flex items-center gap-3 border-b border-ink/10 py-2 last:border-b-0"
            >
              <span className="grow text-[15px] font-bold text-ink">{f.wilaya}</span>
              <Input className="w-28" inputMode="decimal" defaultValue={centsToInput(f.fee_cents)} key={`${f.id}-${f.fee_cents}`}
                aria-label={`${t("fees.fee")} ${f.wilaya} (${formatMoney(f.fee_cents, currency, lang)})`}
                onBlur={(e) => void update(f, e.target.value)} />
              <Button size="sm" variant="ghost" className="text-red" onPress={() => void remove(f)}>{t("fees.remove")}</Button>
            </m.li>
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}
