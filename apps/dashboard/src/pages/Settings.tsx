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
    <div>
      <h1 className="text-2xl font-extrabold mt-1 mb-4">{t("settings.title")}</h1>
      <form onSubmit={save} className="card p-5 flex flex-col gap-4">
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
        <fieldset className="border-0 p-0 m-0 flex flex-col gap-3">
          <legend className="label text-base">{t("settings.info")}</legend>
          <p className="muted text-sm m-0">{t("settings.infoHelp")}</p>
          {INFO_KEYS.map((k) => (
            <div key={k}>
              <label className="label" htmlFor={`info-${k}`}>{t(`settings.f.${k}`)}</label>
              <textarea id={`info-${k}`} className="input" style={{ minHeight: k === "other" ? 100 : 64 }}
                maxLength={k === "other" ? MAX_OTHER : MAX_FIELD} value={info[k]} placeholder={t(`settings.f.${k}Ph`)}
                onChange={(e) => setInfo((f) => ({ ...f, [k as InfoKey]: e.target.value }))} />
            </div>
          ))}
        </fieldset>
        <div>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={agentOn} onChange={(e) => setEnabled(e.target.checked)} /> {t("settings.agent")}
          </label>
          <p className="muted text-sm mt-1 mb-0">{t("settings.agentHelp")}</p>
        </div>
        <div>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={ordersOn} onChange={(e) => setOrdersOn(e.target.checked)} /> {t("settings.orders")}
          </label>
          <p className="muted text-sm mt-1 mb-0">{t("settings.ordersHelp")}</p>
        </div>
        {error && <p className="error m-0" role="alert">{error}</p>}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={busy}>{t("common.save")}</button>
          {saved && <span className="badge badge-ok" role="status">{t("common.saved")}</span>}
        </div>
      </form>
      <FaqEditor storeId={s.id} />
      <DeliveryFees storeId={s.id} currency={s.currency} />
      {TELEGRAM_BOT && <TelegramAlerts storeId={s.id} />}
    </div>
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
    <section className="card p-5 mt-6 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-extrabold m-0">{t("settings.tg.title")}</h2>
        <p className="muted text-sm mt-1 mb-0">{t("settings.tg.help")}</p>
      </div>
      {error && <p className="error m-0" role="alert">{error}</p>}
      {connected === true && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="badge badge-ok">{t("settings.tg.connected")}</span>
          <button className="btn btn-small" disabled={busy} onClick={() => void disconnect()}>{t("settings.tg.disconnect")}</button>
        </div>
      )}
      {connected === false && (
        <>
          <span className="badge badge-muted w-fit">{t("settings.tg.notConnected")}</span>
          <p className="muted text-sm m-0">{t("settings.tg.open")}</p>
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
    <section className="card p-5 mt-6 flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-extrabold m-0">{t("fees.title")}</h2>
        <p className="muted text-sm mt-1 mb-0">{t("fees.help")}</p>
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
      {fees && fees.length === 0 && <p className="muted m-0">{t("fees.empty")}</p>}

      <ul className="list-none p-0 m-0 flex flex-col gap-2">
        {(fees ?? []).map((f) => (
          <li key={f.id} className="flex items-center gap-2">
            <span className="grow font-semibold">{f.wilaya}</span>
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
