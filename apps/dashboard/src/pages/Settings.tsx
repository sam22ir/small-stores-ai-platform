import { useState } from "react";
import type { FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { CURRENCIES } from "./Onboarding";

const ZONES = ["Africa/Algiers", "Africa/Casablanca", "Africa/Tunis", "Europe/Paris", "UTC"];

export function Settings() {
  const { t } = useI18n();
  const { store, refresh } = useStore();
  const s = store!;
  const [name, setName] = useState(s.name);
  const [currency, setCurrency] = useState(s.currency);
  const [timezone, setTimezone] = useState(s.timezone);
  const [info, setInfo] = useState(s.business_info ?? "");
  const [enabled, setEnabled] = useState(s.agent_enabled);
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
      name: name.trim(), currency, timezone, business_info: info.trim() || null, agent_enabled: enabled,
    }).eq("id", s.id);
    if (err) setError(t("common.error"));
    else { setSaved(true); await refresh(); }
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
        <div>
          <label className="label" htmlFor="sinfo">{t("settings.info")}</label>
          <textarea id="sinfo" className="input" style={{ minHeight: 160 }} maxLength={2000} value={info} onChange={(e) => setInfo(e.target.value)} />
          <p className="muted text-sm mt-1 mb-0">{t("settings.infoHelp")}</p>
        </div>
        <div>
          <label className="flex items-center gap-2 font-semibold">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> {t("settings.agent")}
          </label>
          <p className="muted text-sm mt-1 mb-0">{t("settings.agentHelp")}</p>
        </div>
        {error && <p className="error m-0" role="alert">{error}</p>}
        <div className="flex items-center gap-3">
          <button className="btn btn-primary" disabled={busy}>{t("common.save")}</button>
          {saved && <span className="badge badge-ok" role="status">{t("common.saved")}</span>}
        </div>
      </form>
    </div>
  );
}
