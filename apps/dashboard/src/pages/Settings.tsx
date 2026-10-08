import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { centsToInput, formatMoney, parsePrice } from "../lib/format";
import { WILAYAS } from "../lib/wilayas";
import { FaqEditor } from "../components/FaqEditor";
import { INFO_KEYS, MAX_FIELD, MAX_OTHER, composeInfo, fieldsFromStore } from "../lib/storeInfo";
import type { InfoFields, InfoKey } from "../lib/storeInfo";
import { CURRENCIES } from "./Onboarding";

const ZONES = ["Africa/Algiers", "Africa/Casablanca", "Africa/Tunis", "Europe/Paris", "UTC"];

const SECTION_TITLE = "text-[15px] font-semibold text-[var(--heading)] m-0";

// Pill switch. The checkbox stays inside the label so the whole row is the click target.
function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <label className="flex items-start justify-between gap-4 cursor-pointer">
      <span className="min-w-0">
        <span className="block font-semibold text-[15px] text-[var(--heading)]">{label}</span>
        <span className="block muted text-[13px] mt-1">{help}</span>
      </span>
      <span className="relative inline-block h-6 w-11 shrink-0 mt-0.5">
        {/* The real checkbox sits on top of the track (transparent) so it is the click target. */}
        <input type="checkbox" className="peer absolute inset-0 z-10 m-0 h-full w-full cursor-pointer opacity-0" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span aria-hidden="true" className="pointer-events-none block h-full w-full rounded-full bg-[var(--border)] transition-colors peer-checked:bg-[var(--brand)] peer-focus-visible:[outline:2px_solid_var(--brand)] peer-focus-visible:outline-offset-2" />
        <span aria-hidden="true" className="pointer-events-none absolute top-0.5 start-0.5 h-5 w-5 rounded-full bg-white transition-transform peer-checked:translate-x-5 rtl:peer-checked:-translate-x-5" />
      </span>
    </label>
  );
}

export function Settings() {
  const { t } = useI18n();
  const { store, refresh } = useStore();
  const s = store!;
  const [name, setName] = useState(s.name);
  const [currency, setCurrency] = useState(s.currency);
  const [timezone, setTimezone] = useState(s.timezone);
  const [info, setInfo] = useState<InfoFields>(() => fieldsFromStore(s.business_info_fields, s.business_info));
  // null = the owner has not touched this checkbox here, so it follows the store
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
    if (err) setError(t("common.error"));
    else { setEnabled(null); setSaved(true); await refresh(); }
    setBusy(false);
  }

  return (
    <div className="mx-auto max-w-[760px] flex flex-col gap-4">
      <h1 className="text-[20px] font-semibold text-[var(--heading)] mt-1 mb-0">{t("settings.title")}</h1>
      <form onSubmit={save} className="flex flex-col gap-4">
        <section className="card p-5 flex flex-col gap-4" aria-labelledby="sec-store">
          <h2 id="sec-store" className={SECTION_TITLE}>{t("settings.sec.store")}</h2>
          <div>
            <label className="label" htmlFor="sname">{t("settings.name")}</label>
            <input id="sname" className="input" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="scur">{t("settings.currency")}</label>
              <select id="scur" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {currencies.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="stz">{t("settings.timezone")}</label>
              <select id="stz" className="input" value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {zones.map((z) => <option key={z}>{z}</option>)}
              </select>
            </div>
          </div>
        </section>

        <section className="card p-5 flex flex-col gap-4" aria-labelledby="sec-info">
          <div>
            <h2 id="sec-info" className={SECTION_TITLE}>{t("settings.info")}</h2>
            <p className="muted text-[13px] mt-1 mb-0">{t("settings.infoHelp")}</p>
          </div>
          {INFO_KEYS.map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`info-${k}`}>{t(`settings.f.${k}`)}</label>
              <textarea id={`info-${k}`} className="input" style={{ minHeight: k === "other" ? 100 : 64 }}
                maxLength={k === "other" ? MAX_OTHER : MAX_FIELD} value={info[k]} placeholder={t(`settings.f.${k}Ph`)}
                onChange={(e) => setInfo((f) => ({ ...f, [k as InfoKey]: e.target.value }))} />
            </div>
          ))}
        </section>

        <section className="card p-5 flex flex-col gap-4" aria-labelledby="sec-assistant">
          <h2 id="sec-assistant" className={SECTION_TITLE}>{t("assistant.title")}</h2>
          <Toggle checked={agentOn} onChange={(v) => setEnabled(v)} label={t("settings.agent")} help={t("settings.agentHelp")} />
          <div className="border-t border-[var(--divider)] pt-4">
            <Toggle checked={ordersOn} onChange={(v) => setOrdersOn(v)} label={t("settings.orders")} help={t("settings.ordersHelp")} />
          </div>
        </section>

        {error && <p className="error m-0" role="alert">{error}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn btn-primary" disabled={busy}>{t("common.save")}</button>
          {saved && <span className="badge badge-ok" role="status">{t("common.saved")}</span>}
        </div>
      </form>
      <PasswordCard />
      <FaqEditor storeId={s.id} />
      <DeliveryFees storeId={s.id} currency={s.currency} />
      {TELEGRAM_BOT && <TelegramAlerts storeId={s.id} />}
    </div>
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
    if (err) setError(t("common.error"));
    else { setPassword(""); setConfirm(""); setSaved(true); }
    setBusy(false);
  }

  return (
    <section className="card p-5 flex flex-col gap-4" aria-labelledby="sec-password">
      <div>
        <h2 id="sec-password" className={SECTION_TITLE}>{t("settings.pw.title")}</h2>
        <p className="muted text-[13px] mt-1 mb-0">{t("settings.pw.help")}</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="pw-new">{t("auth.newPassword")}</label>
          <input id="pw-new" className="input" type="password" required minLength={8} autoComplete="new-password"
            value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
        </div>
        <div>
          <label className="label" htmlFor="pw-confirm">{t("auth.confirmPassword")}</label>
          <input id="pw-confirm" className="input" type="password" required minLength={8} autoComplete="new-password"
            value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
        </div>
        {error && <p className="error m-0" role="alert">{error}</p>}
        <div className="flex items-center gap-3 flex-wrap">
          <button className="btn btn-primary" disabled={busy}>{t("settings.pw.save")}</button>
          {saved && <span className="badge badge-ok" role="status">{t("settings.pw.saved")}</span>}
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
    if (err) { setError(t("common.error")); setBusy(false); return; }
    await refresh();
  }

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div>
        <h2 className={SECTION_TITLE}>{t("settings.tg.title")}</h2>
        <p className="muted text-[13px] mt-1 mb-0">{t("settings.tg.help")}</p>
      </div>
      {error && <p className="error m-0" role="alert">{error}</p>}
      {connected === true && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="badge badge-ok">{t("settings.tg.connected")}</span>
          <button className="btn btn-small" disabled={busy} onClick={() => void disconnect()}>{t("settings.tg.disconnect")}</button>
        </div>
      )}
      {connected === false && (
        <>
          <span className="badge badge-muted w-fit">{t("settings.tg.notConnected")}</span>
          <p className="muted text-[13px] m-0">{t("settings.tg.open")}</p>
          <div>
            <button className="btn btn-primary" disabled={busy || !code}
              onClick={() => window.open(`https://t.me/${TELEGRAM_BOT}?start=${code}`, "_blank", "noopener")}>
              {t("settings.tg.connect")}
            </button>
          </div>
        </>
      )}
      <div>
        <button className="btn btn-small" disabled={busy} onClick={() => void refresh()}>{t("settings.tg.refresh")}</button>
      </div>
    </section>
  );
}

type Fee = { id: string; wilaya: string; fee_cents: number };

function DeliveryFees({ storeId, currency }: { storeId: string; currency: string }) {
  const { t, lang } = useI18n();
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

  async function add(e: FormEvent) {
    e.preventDefault();
    const name = wilaya.trim();
    const cents = parsePrice(fee);
    if (!name) { setError(t("fees.errWilaya")); return; }
    if (cents === null) { setError(t("fees.errFee")); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.from("delivery_fees").insert({ store_id: storeId, wilaya: name, fee_cents: cents });
    if (err) setError(t("common.error"));
    else { setWilaya(""); await load(); }
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
    if (err) setError(t("common.error"));
    await load();
    setBusy(false);
  }

  async function update(f: Fee, value: string) {
    const cents = parsePrice(value);
    if (cents === null) { setError(t("fees.errFee")); await load(); return; }
    if (cents === f.fee_cents) return;
    setError(null);
    const { error: err } = await supabase.from("delivery_fees").update({ fee_cents: cents }).eq("id", f.id);
    if (err) setError(t("common.error"));
    await load();
  }

  async function remove(f: Fee) {
    setError(null);
    const { error: err } = await supabase.from("delivery_fees").delete().eq("id", f.id);
    if (err) setError(t("common.error"));
    await load();
  }

  return (
    <section className="card p-5 flex flex-col gap-4">
      <div>
        <h2 className={SECTION_TITLE}>{t("fees.title")}</h2>
        <p className="muted text-[13px] mt-1 mb-0">{t("fees.help")}</p>
      </div>

      <form onSubmit={add} className="flex gap-2 flex-wrap items-end">
        <div className="grow basis-40">
          <label className="label" htmlFor="fw">{t("fees.wilaya")}</label>
          <input id="fw" className="input" list="wilayas" value={wilaya} maxLength={60} onChange={(e) => setWilaya(e.target.value)} />
          <datalist id="wilayas">{WILAYAS.filter((w) => !taken.has(w.toLowerCase())).map((w) => <option key={w} value={w} />)}</datalist>
        </div>
        <div className="basis-32">
          <label className="label" htmlFor="ff">{t("fees.defaultFee")} ({currency})</label>
          <input id="ff" className="input" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} />
        </div>
        <button className="btn btn-primary" disabled={busy}>{t("fees.add")}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => void addAll()}>{t("fees.addAll")}</button>
      </form>
      {error && <p className="error m-0" role="alert">{error}</p>}
      {failed && <p className="error m-0">{t("common.error")}</p>}
      {fees && fees.length === 0 && <p className="muted text-[13px] m-0">{t("fees.empty")}</p>}

      <ul className="list-none p-0 m-0 flex flex-col border-t border-[var(--divider)]">
        {(fees ?? []).map((f) => (
          <li key={f.id} className="flex items-center gap-3 py-2 border-b border-[var(--divider)] last:border-b-0">
            <span className="grow font-semibold text-[15px] text-[var(--heading)]">{f.wilaya}</span>
            <input className="input" style={{ width: 110 }} inputMode="decimal" defaultValue={centsToInput(f.fee_cents)} key={`${f.id}-${f.fee_cents}`}
              aria-label={`${t("fees.fee")} ${f.wilaya} (${formatMoney(f.fee_cents, currency, lang)})`}
              onBlur={(e) => void update(f, e.target.value)} />
            <button className="btn btn-small" onClick={() => void remove(f)}>{t("fees.remove")}</button>
          </li>
        ))}
      </ul>
    </section>
  );
}
