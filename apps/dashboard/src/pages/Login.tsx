import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { LangSwitch } from "../components/LangSwitch";

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

  const benefits = [t("auth.benefit1"), t("auth.benefit2"), t("auth.benefit3")];
  const textButton = "bg-transparent border-0 text-[var(--brand)] font-semibold text-sm min-h-11 px-2 cursor-pointer";

  return (
    <div className="min-h-screen bg-[var(--bg)] lg:grid lg:grid-cols-2">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-8">
        <div className="w-full max-w-[400px]">
          <div className="flex justify-end mb-4"><LangSwitch /></div>
          <div className="card p-6">
            <div className="text-center mb-6">
              <div
                aria-hidden="true"
                className="mx-auto grid size-14 place-items-center rounded-full bg-[var(--brand)] text-[var(--brand-contrast)] text-2xl font-bold"
              >
                {t("app.name").charAt(0)}
              </div>
              <h1 className="text-xl font-semibold text-[var(--heading)] mt-4 mb-1">{t("app.name")}</h1>
              <p className="muted text-sm m-0">{t("auth.subtitle")}</p>
            </div>
            {!configured && <p className="error" role="alert">{t("setup.missing")}</p>}
            <form onSubmit={submit} className="flex flex-col gap-4">
              <div>
                <label className="label" htmlFor="email">{t("auth.email")}</label>
                <input id="email" className="input" type="email" autoComplete="email" required
                  value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
              </div>
              {mode === "link" && <p className="muted text-sm m-0">{t("auth.linkHelp")}</p>}
              {mode === "forgot" && <p className="muted text-sm m-0">{t("auth.forgotHelp")}</p>}
              {mode !== "link" && mode !== "forgot" && <div>
                <label className="label" htmlFor="password">{t("auth.password")}</label>
                <input id="password" className="input" type="password" required minLength={8}
                  autoComplete={mode === "in" ? "current-password" : "new-password"}
                  value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                {mode === "in" && (
                  <div className="flex justify-end mt-1">
                    <button type="button" className={textButton} onClick={() => switchTo("forgot")}>
                      {t("auth.forgot")}
                    </button>
                  </div>
                )}
              </div>}
              {error && <p className="error m-0" role="alert">{error}</p>}
              {invalidCreds && (
                <div className="rounded-[12px] border border-[var(--border)] bg-[var(--surface-2)] p-3 flex flex-col gap-1">
                  <p className="m-0 text-sm text-[var(--text)]">{t("auth.joinedHint")}</p>
                  <div className="flex flex-wrap gap-x-2">
                    <button type="button" className={textButton} onClick={() => switchTo("forgot")}>
                      {t("auth.setPassword")}
                    </button>
                    <button type="button" className={textButton} onClick={() => switchTo("link")}>
                      {t("auth.linkMode")}
                    </button>
                  </div>
                </div>
              )}
              {notice && <p className="m-0 text-sm" role="status">{notice}</p>}
              <button className="btn btn-primary w-full" disabled={busy || !configured}>
                {mode === "link" ? t("auth.sendLink")
                  : mode === "forgot" ? t("auth.sendReset")
                  : t("auth.signIn")}
              </button>
            </form>
            <div className="flex flex-col items-center gap-1 mt-4">
              {mode === "forgot" ? (
                <button type="button" className={textButton} onClick={() => switchTo("in")}>
                  {t("auth.backToSignIn")}
                </button>
              ) : (
                <>
                  <button type="button" className={textButton}
                    onClick={() => switchTo(mode === "link" ? "in" : "link")}>
                    {mode === "link" ? t("auth.passwordMode") : t("auth.linkMode")}
                  </button>
                  {mode !== "link" && (
                    <Link to="/signup" className={textButton + " inline-flex items-center justify-center no-underline"}>
                      {t("auth.noAccount")}
                    </Link>
                  )}
                </>
              )}
            </div>
          </div>
          <nav className="muted text-xs mt-5 flex justify-center gap-4 flex-wrap" aria-label="Legal">
            <Link to="/privacy" className="muted">Privacy</Link>
            <Link to="/terms" className="muted">Terms</Link>
            <Link to="/data-deletion" className="muted">Data deletion</Link>
          </nav>
        </div>
      </div>
      <aside className="hidden lg:flex flex-col justify-center gap-5 bg-[var(--brand-soft)] border-s border-[var(--brand-border)] p-12">
        <ul className="flex flex-col gap-5 m-0 p-0 list-none max-w-[420px]">
          {benefits.map((b) => (
            <li key={b} className="flex items-start gap-3 text-[15px] text-[var(--text)]">
              <span aria-hidden="true" className="mt-2 size-2 shrink-0 rounded-full bg-[var(--brand)]" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
