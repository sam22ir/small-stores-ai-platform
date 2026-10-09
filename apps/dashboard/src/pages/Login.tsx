import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { AuthLayout } from "../components/AuthLayout";

type Mode = "in" | "link" | "forgot";

// Wrong email or password. Accounts created by email link have no password yet.
function isInvalidCredentials(err: { code?: string; message: string }) {
  return err.code === "invalid_credentials" || /invalid login credentials/i.test(err.message);
}

// Supabase sends too many auth emails from one address: show a plain-language wait message.
function isRateLimited(err: { code?: string; message: string }) {
  return err.code === "over_email_send_rate_limit" || /email rate limit|over_email_send_rate_limit|rate limit/i.test(err.message);
}

export function Login() {
  const { t } = useI18n();
  const friendly = (err: { code?: string; message: string }) => (isRateLimited(err) ? t("auth.rateLimited") : err.message);
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invalidCreds, setInvalidCreds] = useState(false);

  if (!loading && session) return <Navigate to="/inbox" replace />;

  function switchTo(next: Mode) {
    setMode(next); setError(null); setNotice(null); setInvalidCreds(false);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null); setInvalidCreds(false);
    try {
      if (mode === "link") {
        const { error: err } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { emailRedirectTo: window.location.origin },
        });
        if (err) setError(friendly(err)); else setNotice(t("auth.linkSent"));
      } else if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        // Same message whether or not the account exists.
        if (err) setError(friendly(err)); else setNotice(t("auth.forgotSent"));
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) {
          setError(friendly(err));
          setInvalidCreds(isInvalidCredentials(err));
        }
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "forgot" ? t("auth.forgot") : t("auth.signIn");

  const footer = (
    <div className="wk-foot">
      {mode === "forgot" ? (
        <button type="button" className="wk-text" onClick={() => switchTo("in")}>
          {t("auth.backToSignIn")}
        </button>
      ) : (
        <>
          <button type="button" className="wk-text" onClick={() => switchTo(mode === "link" ? "in" : "link")}>
            {mode === "link" ? t("auth.passwordMode") : t("auth.linkMode")}
          </button>
          {mode !== "link" && (
            <Link to="/signup" className="wk-text">{t("auth.noAccount")}</Link>
          )}
        </>
      )}
    </div>
  );

  return (
    <AuthLayout title={title} subtitle={t("auth.subtitle")} footer={footer}>
      {!configured && <p className="wk-error" role="alert">{t("setup.missing")}</p>}
      <form onSubmit={submit} className="wk-form">
        <div className="wk-field">
          <label className="wk-label" htmlFor="email">{t("auth.email")}</label>
          <input id="email" className="wk-input" type="email" autoComplete="email" required
            value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
        </div>
        {mode === "link" && <p className="wk-help">{t("auth.linkHelp")}</p>}
        {mode === "forgot" && <p className="wk-help">{t("auth.forgotHelp")}</p>}
        {mode !== "link" && mode !== "forgot" && <div className="wk-field">
          <label className="wk-label" htmlFor="password">{t("auth.password")}</label>
          <input id="password" className="wk-input" type="password" required minLength={8}
            autoComplete={mode === "in" ? "current-password" : "new-password"}
            value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
          {mode === "in" && (
            <div className="wk-row-end">
              <button type="button" className="wk-text" onClick={() => switchTo("forgot")}>
                {t("auth.forgot")}
              </button>
            </div>
          )}
        </div>}
        {error && <p className="wk-error" role="alert">{error}</p>}
        {invalidCreds && (
          <div className="wk-hint">
            <p>{t("auth.joinedHint")}</p>
            <div className="wk-hint-actions">
              <button type="button" className="wk-text" onClick={() => switchTo("forgot")}>
                {t("auth.setPassword")}
              </button>
              <button type="button" className="wk-text" onClick={() => switchTo("link")}>
                {t("auth.linkMode")}
              </button>
            </div>
          </div>
        )}
        {notice && <p className="wk-notice" role="status">{notice}</p>}
        <button className="btn btn-primary wk-submit" disabled={busy || !configured}>
          {mode === "link" ? t("auth.sendLink")
            : mode === "forgot" ? t("auth.sendReset")
            : t("auth.signIn")}
        </button>
      </form>
    </AuthLayout>
  );
}
