import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { AnimatePresence, m } from "motion/react";
import { Alert, Button, Input, Label, ListBox, Select, Spinner, Switch, TextArea, TextField, toast } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { centsToInput, formatMoney, parsePrice } from "../lib/format";
import { REPLY_PACKS, billingView, formatDa, pricePerReply } from "../lib/billing";
import { WILAYAS } from "../lib/wilayas";
import { FaqEditor } from "../components/FaqEditor";
import { INFO_KEYS, MAX_FIELD, MAX_OTHER, composeInfo, fieldsFromStore } from "../lib/storeInfo";
import type { InfoFields, InfoKey } from "../lib/storeInfo";
import { CURRENCIES } from "./Onboarding";

const ZONES = ["Africa/Algiers", "Africa/Casablanca", "Africa/Tunis", "Europe/Paris", "UTC"];

const CARD = "flex flex-col gap-4 rounded-wakil-lg border-2 border-ink bg-slip p-5 shadow-ink-sm";
const SECTION_TITLE = "m-0 text-[15px] font-extrabold text-ink";

// Inline "saved" check that pops in beside a save button.
function SavedCheck({ show, label }: { show: boolean; label: string }) {
  const reduced = useMotionSafe();
  return (
    <AnimatePresence>
      {show && (
        <m.span key="ok" role="status" className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-slip px-3 py-1 text-sm font-bold text-ink"
          initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: dur.short, ease: ease.stamp }}>
          <span aria-hidden="true" className="text-success">✓</span>{label}
        </m.span>
      )}
    </AnimatePresence>
  );
}

// Store-level switch row: label and help text, switch on the end.
function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <Switch isSelected={checked} onChange={onChange} className="flex w-full items-start justify-between gap-4">
      <span className="min-w-0 flex-1">
        <Switch.Content className="block text-[15px] font-bold text-ink">{label}</Switch.Content>
        <span className="mt-1 block text-[13px] text-soft">{help}</span>
      </span>
      <Switch.Control><Switch.Thumb /></Switch.Control>
    </Switch>
  );
}

export function Settings() {
  const { t } = useI18n();
  const reduced = useMotionSafe();
  const { store, refresh } = useStore();
  const s = store!;
  const [name, setName] = useState(s.name);
  const [currency, setCurrency] = useState(s.currency);
  const [timezone, setTimezone] = useState(s.timezone);
  const [info, setInfo] = useState<InfoFields>(() => fieldsFromStore(s.business_info_fields, s.business_info));
  // null = the owner has not touched this switch here, so it follows the store
  // (the header pause switch can change agent_enabled while this page is open).
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const agentOn = enabled ?? s.agent_enabled;
  const [ordersOn, setOrdersOn] = useState(s.orders_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError(null); setSaved(false);
    const { error: err } = await supabase.from("stores").update({
      name: name.trim(), currency, timezone, business_info: composeInfo(info) || null, business_info_fields: info,
      orders_enabled: ordersOn,
      ...(enabled === null ? {} : { agent_enabled: enabled }),
    }).eq("id", s.id);
    if (err) { setError(t("common.error")); toast.danger(t("common.error")); }
    else { setEnabled(null); setSaved(true); toast.success(t("common.saved")); await refresh(); }
    setBusy(false);
  }

  return (
    <m.div
      className="mx-auto flex max-w-[760px] flex-col gap-4"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      <h1 className="mb-0 mt-1 text-[22px] font-extrabold text-ink">{t("settings.title")}</h1>
      <form onSubmit={save} className="flex flex-col gap-4">
        <section className={CARD} aria-labelledby="sec-store">
          <h2 id="sec-store" className={SECTION_TITLE}>{t("settings.sec.store")}</h2>
          <TextField value={name} onChange={setName} isRequired maxLength={100} className="w-full">
            <Label>{t("settings.name")}</Label>
            <Input id="sname" />
          </TextField>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label>{t("settings.currency")}</Label>
              <Select aria-label={t("settings.currency")} selectedKey={currency} onSelectionChange={(k) => setCurrency(String(k))} className="w-full">
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {currencies.map((c) => <ListBox.Item key={c} id={c} textValue={c}>{c}<ListBox.ItemIndicator /></ListBox.Item>)}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("settings.timezone")}</Label>
              <Select aria-label={t("settings.timezone")} selectedKey={timezone} onSelectionChange={(k) => setTimezone(String(k))} className="w-full">
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {zones.map((z) => <ListBox.Item key={z} id={z} textValue={z}>{z}<ListBox.ItemIndicator /></ListBox.Item>)}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>
        </section>

        <section className={CARD} aria-labelledby="sec-info">
          <div>
            <h2 id="sec-info" className={SECTION_TITLE}>{t("settings.info")}</h2>
            <p className="mb-0 mt-1 text-[13px] text-soft">{t("settings.infoHelp")}</p>
          </div>
          {INFO_KEYS.map((k) => (
            <TextField key={k} value={info[k]} className="w-full"
              onChange={(v) => setInfo((f) => ({ ...f, [k as InfoKey]: v }))} maxLength={k === "other" ? MAX_OTHER : MAX_FIELD}>
              <Label>{t(`settings.f.${k}`)}</Label>
              <TextArea id={`info-${k}`} rows={k === "other" ? 4 : 2} placeholder={t(`settings.f.${k}Ph`)} />
            </TextField>
          ))}
        </section>

        <section className={CARD} aria-labelledby="sec-assistant">
          <h2 id="sec-assistant" className={SECTION_TITLE}>{t("assistant.title")}</h2>
          <Toggle checked={agentOn} onChange={(v) => setEnabled(v)} label={t("settings.agent")} help={t("settings.agentHelp")} />
          <div className="border-t border-ink/10 pt-4">
            <Toggle checked={ordersOn} onChange={(v) => setOrdersOn(v)} label={t("settings.orders")} help={t("settings.ordersHelp")} />
            {/* Taking orders reveals the delivery-fee section below, with a height animation. */}
            <AnimatePresence initial={false}>
              {ordersOn && (
                <m.div
                  key="fees-hint"
                  initial={reduced ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={reduced ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: dur.short, ease: ease.out }}
                  className="overflow-hidden"
                >
                  <p className="mb-0 mt-3 rounded-wakil border-2 border-ink/15 bg-paper p-3 text-[13px] text-soft">{t("fees.help")}</p>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        </section>

        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" isDisabled={busy}>{t("common.save")}</Button>
          <SavedCheck show={saved} label={t("common.saved")} />
        </div>
      </form>
      {s.trial_ends_at && <BillingCard store={s} />}
      {s.trial_ends_at && <ReplyCreditsCard store={s} />}
      <PasswordCard />
      <FaqEditor storeId={s.id} />
      <DeliveryFees storeId={s.id} currency={s.currency} />
      {TELEGRAM_BOT && <TelegramAlerts storeId={s.id} />}
    </m.div>
  );
}

// Subscription status and the "Pay" button (Chargily checkout, see supabase/functions/billing-checkout).
// Shown to owners only: the checkout function rejects other members anyway.
function BillingCard({ store }: { store: { id: string; trial_ends_at: string; paid_until: string | null } }) {
  const { t, lang } = useI18n();
  const { refresh } = useStore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const view = billingView(store);
  const locale = lang === "ar" ? "ar-DZ" : lang === "fr" ? "fr-DZ" : "en-GB";
  const date = new Date(view.endsAt).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });

  // Chargily sends the owner back with ?billing=success|failed. The webhook may land a moment later.
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("billing");
    if (result === "success") { toast.success(t("billing.paidOk")); void refresh(); }
    if (result === "failed") toast.danger(t("billing.paidFailed"));
  }, []);

  async function pay() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.functions.invoke("billing-checkout", { body: { store_id: store.id } });
    if (err || !data?.checkout_url) { setError(t("common.error")); setBusy(false); return; }
    window.location.href = data.checkout_url as string;
  }

  const tone = view.status === "active" || view.status === "trial" ? "bg-slip" : "bg-surface-secondary";
  return (
    <section className={CARD}>
      <div>
        <h2 className={SECTION_TITLE}>{t("billing.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("billing.help")}</p>
      </div>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      <div className="flex flex-wrap items-center gap-3">
        <span className={`rounded-full border-2 border-ink px-3 py-1 text-sm font-bold text-ink ${tone}`}>{t(`billing.status.${view.status}`)}</span>
        <span className="text-[13px] text-soft">
          {view.status === "trial" ? t("billing.trialEnds", { date, n: view.daysLeft })
            : view.status === "active" || view.status === "grace" ? t("billing.paidUntil", { date, n: view.daysLeft })
            : t("billing.expiredSince", { date })}
        </span>
      </div>
      {(view.status === "expired" || view.status === "grace") && (
        <p className="m-0 text-[13px] text-soft">{t("billing.expiredNote")}</p>
      )}
      <div>
        <Button variant="primary" isDisabled={busy} onPress={() => void pay()}>{t("billing.pay")}</Button>
      </div>
    </section>
  );
}

// Reply credit packs: extra replies bought on top of the monthly plan. The checkout sets the price
// server-side, so the client only sends the pack size (see supabase/functions/billing-checkout).
function ReplyCreditsCard({ store }: { store: { id: string; reply_credits: number } }) {
  const { t, lang } = useI18n();
  const [pendingPack, setPendingPack] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const locale = lang === "ar" ? "ar-u-nu-latn" : lang === "fr" ? "fr-FR" : "en-US";

  async function buy(credits: number) {
    setPendingPack(credits); setError(null);
    const { data, error: err } = await supabase.functions.invoke("billing-checkout", { body: { store_id: store.id, pack: String(credits) } });
    if (err || !data?.checkout_url) { setError(t("common.error")); toast.danger(t("common.error")); setPendingPack(null); return; }
    window.location.href = data.checkout_url as string;
  }

  return (
    <section className={CARD} aria-labelledby="sec-reply-credits">
      <div>
        <h2 id="sec-reply-credits" className={SECTION_TITLE}>{t("billing.credits.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("billing.credits.help")}</p>
      </div>
      <p className="m-0 text-sm font-bold text-ink" aria-live="polite">
        {t("billing.credits.balance", { n: formatDa(store.reply_credits, locale) })}
      </p>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      <div className="grid gap-3 sm:grid-cols-3">
        {REPLY_PACKS.map((pack) => (
          <Button
            key={pack.credits}
            variant="secondary"
            isDisabled={pendingPack !== null}
            isPending={pendingPack === pack.credits}
            onPress={() => void buy(pack.credits)}
            className="flex h-auto min-h-16 w-full flex-col items-center gap-1 py-3"
          >
            {pendingPack === pack.credits && <Spinner color="current" size="sm" />}
            <span className="text-[15px] font-extrabold">{t("billing.credits.pack", { n: formatDa(pack.credits, locale) })}</span>
            <span className="text-sm">{t("billing.credits.price", { price: formatDa(pack.price, locale) })}</span>
            <span className="text-[12px] opacity-80">{t("billing.credits.perReply", { price: formatDa(pricePerReply(pack), locale, 2) })}</span>
          </Button>
        ))}
      </div>
    </section>
  );
}

// Lets owners who joined by email link set a password for password sign-in.
function PasswordCard() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (password.length < 8) { setError(t("auth.passwordRule")); return; }
    if (password !== confirm) { setError(t("auth.passwordMismatch")); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(t("common.error")); toast.danger(t("common.error")); }
    else { setPassword(""); setConfirm(""); setSaved(true); toast.success(t("settings.pw.saved")); }
    setBusy(false);
  }

  return (
    <section className={CARD} aria-labelledby="sec-password">
      <div>
        <h2 id="sec-password" className={SECTION_TITLE}>{t("settings.pw.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("settings.pw.help")}</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        <TextField value={password} onChange={setPassword} isRequired minLength={8} className="w-full">
          <Label>{t("auth.newPassword")}</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" dir="ltr" />
        </TextField>
        <TextField value={confirm} onChange={setConfirm} isRequired minLength={8} className="w-full">
          <Label>{t("auth.confirmPassword")}</Label>
          <Input id="pw-confirm" type="password" autoComplete="new-password" dir="ltr" />
        </TextField>
        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" isDisabled={busy}>{t("settings.pw.save")}</Button>
          <SavedCheck show={saved} label={t("settings.pw.saved")} />
        </div>
      </form>
    </section>
  );
}

// Bot username (without @). When unset the Telegram card is hidden.
const TELEGRAM_BOT = ((import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "").trim();

function TelegramAlerts({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc("telegram_link", { p_store_id: storeId });
    if (err || !data) setError(t("common.error"));
    else { setConnected(data.connected); setCode(data.code); }
    setBusy(false);
  }

  useEffect(() => { void refresh(); }, [storeId]);

  async function disconnect() {
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc("telegram_unlink", { p_store_id: storeId });
    if (err) { setError(t("common.error")); toast.danger(t("common.error")); setBusy(false); return; }
    await refresh();
  }

  return (
    <section className={CARD}>
      <div>
        <h2 className={SECTION_TITLE}>{t("settings.tg.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("settings.tg.help")}</p>
      </div>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      {connected === true && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border-2 border-ink bg-slip px-3 py-1 text-sm font-bold text-ink">{t("settings.tg.connected")}</span>
          <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void disconnect()}>{t("settings.tg.disconnect")}</Button>
        </div>
      )}
      {connected === false && (
        <>
          <span className="w-fit rounded-full bg-surface-secondary px-3 py-1 text-sm font-semibold text-ink">{t("settings.tg.notConnected")}</span>
          <p className="m-0 text-[13px] text-soft">{t("settings.tg.open")}</p>
          <div>
            <Button variant="primary" isDisabled={busy || !code}
              onPress={() => window.open(`https://t.me/${TELEGRAM_BOT}?start=${code}`, "_blank", "noopener")}>
              {t("settings.tg.connect")}
            </Button>
          </div>
        </>
      )}
      <div>
        <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void refresh()}>{t("settings.tg.refresh")}</Button>
      </div>
    </section>
  );
}

type Fee = { id: string; wilaya: string; fee_cents: number };

function DeliveryFees({ storeId, currency }: { storeId: string; currency: string }) {
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
