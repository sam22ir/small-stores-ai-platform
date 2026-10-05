import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { LangSwitch } from "../components/LangSwitch";

export function Login() {
  const { t } = useI18n();
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<"in" | "up" | "link">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (!loading && session) return <Navigate to="/" replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null);
    try {
      if (mode === "link") {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) setError(err.message); else setNotice(t("auth.linkSent"));
      } else if (mode === "in") {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError(err.message);
      } else {
        const { data, error: err } = await supabase.auth.signUp({ email: email.trim(), password });
        if (err) setError(err.message);
        else if (!data.session) setNotice(t("auth.checkEmail"));
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex justify-end mb-3"><LangSwitch /></div>
        <div className="card p-6">
          <div className="text-center mb-5">
            <img src="/icon-192.png" alt="" width={56} height={56} className="mx-auto rounded-2xl" />
            <h1 className="text-2xl font-extrabold mt-3 mb-1">{t("app.name")}</h1>
            <p className="muted m-0">{t("auth.subtitle")}</p>
          </div>
          {!configured && <p className="error">{t("setup.missing")}</p>}
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div>
              <label className="label" htmlFor="email">{t("auth.email")}</label>
              <input id="email" className="input" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
            </div>
            {mode === "link" && <p className="muted text-sm m-0">{t("auth.linkHelp")}</p>}
            {mode !== "link" && <div>
              <label className="label" htmlFor="password">{t("auth.password")}</label>
              <input id="password" className="input" type="password" required minLength={8}
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            </div>}
            {error && <p className="error m-0" role="alert">{error}</p>}
            {notice && <p className="m-0" role="status">{notice}</p>}
            <button className="btn btn-primary" disabled={busy || !configured}>
              {mode === "link" ? t("auth.sendLink") : mode === "in" ? t("auth.signIn") : t("auth.signUp")}
            </button>
          </form>
          <button className="btn mt-3 w-full" style={{ border: "none", background: "none" }}
            onClick={() => { setMode(mode === "link" ? "in" : "link"); setError(null); setNotice(null); }}>
            {mode === "link" ? t("auth.passwordMode") : t("auth.linkMode")}
          </button>
          {mode !== "link" && (
            <button className="btn w-full" style={{ border: "none", background: "none" }}
              onClick={() => { setMode(mode === "in" ? "up" : "in"); setError(null); setNotice(null); }}>
              {mode === "in" ? t("auth.noAccount") : t("auth.haveAccount")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
