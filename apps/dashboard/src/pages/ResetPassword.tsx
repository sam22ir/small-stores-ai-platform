import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { LangSwitch } from "../components/LangSwitch";

// Public route. The recovery link signs the user in (supabase-js reads the tokens from the URL),
// so this page only needs the session to set the password.
export function ResetPassword() {
  const { t } = useI18n();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!done) return;
    const id = window.setTimeout(() => navigate("/", { replace: true }), 1500);
    return () => window.clearTimeout(id);
  }, [done, navigate]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) { setError(t("auth.passwordRule")); return; }
    if (password !== confirm) { setError(t("auth.passwordMismatch")); return; }
    setBusy(true); setError(null);
    try {
      const { error: err } = await supabase.auth.updateUser({ password });
      if (err) setError(t("common.error")); else setDone(true);
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const expired = !loading && !session && !done;

  return (
    <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center px-4 py-8">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-end mb-4"><LangSwitch /></div>
        <div className="card p-6">
          {loading && <p className="muted text-center m-0">{t("common.loading")}</p>}
          {expired && (
            <div className="flex flex-col gap-4 text-center">
              <p className="error m-0" role="alert">{t("auth.linkExpired")}</p>
              <Link to="/login" replace className="btn btn-primary w-full">{t("auth.backToSignIn")}</Link>
            </div>
          )}
          {!loading && (session || done) && (
            <>
              <h1 className="text-xl font-semibold text-[var(--heading)] mt-0 mb-1">{t("auth.resetTitle")}</h1>
              <p className="muted text-sm mt-0 mb-5">{t("auth.resetHelp")}</p>
              {done ? (
                <p className="m-0 text-sm" role="status">{t("auth.passwordSaved")}</p>
              ) : (
                <form onSubmit={submit} className="flex flex-col gap-4">
                  <div>
                    <label className="label" htmlFor="new-password">{t("auth.newPassword")}</label>
                    <input id="new-password" className="input" type="password" required minLength={8}
                      autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                  </div>
                  <div>
                    <label className="label" htmlFor="confirm-password">{t("auth.confirmPassword")}</label>
                    <input id="confirm-password" className="input" type="password" required minLength={8}
                      autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
                  </div>
                  {error && <p className="error m-0" role="alert">{error}</p>}
                  <button className="btn btn-primary w-full" disabled={busy}>{t("auth.savePassword")}</button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
