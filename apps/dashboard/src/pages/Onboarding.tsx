import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import { useI18n } from "../lib/i18n";
import { LangSwitch } from "../components/LangSwitch";

export const CURRENCIES = ["DZD", "EUR", "USD", "MAD", "TND"];

export function Onboarding() {
  const { t } = useI18n();
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

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-3"><LangSwitch /></div>
        <form onSubmit={submit} className="card p-6 flex flex-col gap-4">
          <div>
            <h1 className="text-xl font-extrabold m-0">{t("onboarding.title")}</h1>
            <p className="muted mt-1 mb-0">{t("onboarding.subtitle")}</p>
          </div>
          <div>
            <label className="label" htmlFor="name">{t("onboarding.name")}</label>
            <input id="name" className="input" required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="currency">{t("onboarding.currency")}</label>
            <select id="currency" className="input" value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {error && <p className="error m-0" role="alert">{error}</p>}
          <button className="btn btn-primary" disabled={busy || !name.trim()}>{t("onboarding.create")}</button>
        </form>
      </div>
    </div>
  );
}
