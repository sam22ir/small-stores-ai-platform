import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { LangSwitch } from "../components/LangSwitch";

export const CURRENCIES = ["DZD", "EUR", "USD", "MAD", "TND"];

// Two-step stepper: step 1 is the store name, step 2 the currency. Step 2 lights up once a name is typed.
function Stepper({ step, labels }: { step: 1 | 2; labels: [string, string] }) {
  const reduced = useMotionSafe();
  return (
    <ol className="m-0 flex list-none items-center gap-3 p-0" aria-label={labels.join(" / ")}>
      {labels.map((label, i) => {
        const n = (i + 1) as 1 | 2;
        const active = n <= step;
        return (
          <li key={label} className="flex min-w-0 items-center gap-2">
            <m.span
              className={`grid size-8 shrink-0 place-items-center rounded-full border-2 border-ink text-sm font-extrabold ${active ? "bg-blue text-slip" : "bg-slip text-soft"}`}
              initial={false}
              animate={reduced ? undefined : { scale: active ? [1, 1.12, 1] : 1 }}
              transition={{ duration: dur.short, ease: ease.stamp }}
            >
              {n}
            </m.span>
            <span className={`truncate text-sm font-bold ${active ? "text-ink" : "text-soft"}`}>{label}</span>
            {i === 0 && <span aria-hidden="true" className="mx-1 h-0.5 w-8 rounded-full bg-ink/20" />}
          </li>
        );
      })}
    </ol>
  );
}

// The order slip: a receipt that fills in as the owner types the store name and picks a currency.
function OrderSlip({ name, currency, label }: { name: string; currency: string; label: string }) {
  const reduced = useMotionSafe();
  const filled = Math.min(name.trim().length / 24, 1);
  return (
    <div className="relative rounded-wakil border-2 border-ink bg-slip px-5 py-4 shadow-ink-sm" aria-hidden="true">
      <div className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-soft">{label}</div>
      <div className="mt-2 min-h-7 text-lg font-extrabold text-ink">
        <AnimatePresence mode="popLayout" initial={false}>
          <m.span key={name.trim() || "empty"} className="inline-block"
            initial={reduced ? false : { y: 8, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={reduced ? undefined : { y: -8, opacity: 0 }}
            transition={{ duration: dur.micro, ease: ease.out }}>
            {name.trim() || "—"}
          </m.span>
        </AnimatePresence>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-ink/10">
        <m.div className="h-full origin-left rtl:origin-right rounded-full bg-blue" style={{ width: "100%" }}
          animate={{ scaleX: filled }} transition={{ duration: dur.short, ease: ease.out }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-sm">
        <span className="text-soft">{currency}</span>
        <span className="font-bold text-ink">0.00 {currency}</span>
      </div>
      {/* Perforated edge */}
      <div className="absolute inset-x-0 -bottom-[2px] flex justify-between px-2" aria-hidden="true">
        {Array.from({ length: 9 }).map((_, i) => <span key={i} className="size-2.5 -translate-y-1/2 rounded-full bg-paper" />)}
      </div>
    </div>
  );
}

export function Onboarding() {
  const { t } = useI18n();
  const reduced = useMotionSafe();
  const { store, loading, refresh } = useStore();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [currency, setCurrency] = useState("DZD");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return null;
  if (store) return <Navigate to="/inbox" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc("create_store", { p_name: name.trim(), p_currency: currency });
    if (err) { setError(err.message); setBusy(false); return; }
    await refresh();
    navigate("/inbox", { replace: true });
  }

  const step: 1 | 2 = name.trim() ? 2 : 1;

  return (
    <m.div
      className="flex min-h-screen flex-col items-center justify-center bg-paper px-4 py-8"
      initial={reduced ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      <div className="w-full max-w-[420px]">
        <div className="mb-4 flex justify-end"><LangSwitch /></div>
        <form onSubmit={submit} className="flex flex-col gap-5 rounded-wakil-lg border-2 border-ink bg-slip p-6 shadow-ink">
          <Stepper step={step} labels={[t("onboarding.name"), t("onboarding.currency")]} />
          <div>
            <h1 className="m-0 text-2xl font-extrabold text-ink">{t("onboarding.title")}</h1>
            <p className="mb-0 mt-1 text-sm text-soft">{t("onboarding.subtitle")}</p>
          </div>
          <OrderSlip name={name} currency={currency} label={t("onboarding.title")} />
          <TextField value={name} onChange={setName} isRequired maxLength={100} autoFocus className="w-full">
            <Label>{t("onboarding.name")}</Label>
            <Input id="name" />
          </TextField>
          <div className="flex flex-col gap-1.5">
            <Label>{t("onboarding.currency")}</Label>
            <Select aria-label={t("onboarding.currency")} selectedKey={currency} onSelectionChange={(k) => setCurrency(String(k))} className="w-full">
              <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
              <Select.Popover>
                <ListBox>
                  {CURRENCIES.map((c) => <ListBox.Item key={c} id={c} textValue={c}>{c}<ListBox.ItemIndicator /></ListBox.Item>)}
                </ListBox>
              </Select.Popover>
            </Select>
          </div>
          {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
          <Button type="submit" variant="primary" fullWidth isDisabled={busy || !name.trim()} className="font-semibold">
            {t("onboarding.create")}
          </Button>
        </form>
      </div>
    </m.div>
  );
}
