import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { LangSwitch } from "../components/LangSwitch";

// Supabase says this when the address already has an account.
function isAlreadyRegistered(err: { code?: string; message: string }) {
  return err.code === "user_already_exists" || /already (registered|been registered|exists)/i.test(err.message);
}

// Supabase sends too many auth emails from one address: same wording as the login page.
function isRateLimited(err: { code?: string; message: string }) {
  return err.code === "over_email_send_rate_limit" || /email rate limit|over_email_send_rate_limit|rate limit/i.test(err.message);
}

type Field = "email" | "password" | "confirm";
type FieldErrors = Partial<Record<Field, string>>;

// Owners get their store on the first sign-in: /onboarding asks for the store name and currency
// (create_store RPC). So sign-up only collects the account details.
export function SignUp() {
  const { t } = useI18n();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);

  if (!loading && session) return <Navigate to="/inbox" replace />;

  function validate(): FieldErrors {
    const errs: FieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) errs.email = t("auth.emailInvalid");
    if (password.length < 8) errs.password = t("auth.passwordRule");
    if (confirm !== password) errs.confirm = t("auth.passwordMismatch");
    return errs;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const errs = validate();
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (err) {
        setError(isAlreadyRegistered(err) ? t("auth.emailTaken") : isRateLimited(err) ? t("auth.rateLimited") : err.message);
      } else if (data.session) {
        // Same place login sends a signed-in owner.
        navigate("/inbox", { replace: true });
      } else {
        // Email confirmation is on: no session until the owner opens the link.
        setCheckEmail(true);
      }
    } catch {
      setError(t("common.error"));
    } finally {
      setBusy(false);
    }
  }

  const benefits = [t("auth.benefit1"), t("auth.benefit2"), t("auth.benefit3")];
  const textLink = "inline-flex items-center justify-center min-h-11 px-2 text-[var(--brand)] font-semibold text-sm no-underline";
  const fieldError = (f: Field) => fieldErrors[f] && (
    <p className="error text-sm m-0 mt-1" role="alert" id={`${f}-error`}>{fieldErrors[f]}</p>
  );

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
            {checkEmail ? (
              <div className="flex flex-col gap-4">
                <p className="m-0 text-sm" role="status">{t("auth.checkEmail")}</p>
                <Link to="/login" className={textLink + " justify-center"}>{t("auth.backToSignIn")}</Link>
              </div>
            ) : (
              <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
                <div>
                  <label className="label" htmlFor="email">{t("auth.email")}</label>
                  <input id="email" className="input" type="email" autoComplete="email" required
                    aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-error" : undefined}
                    value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
                  {fieldError("email")}
                </div>
                <div>
                  <label className="label" htmlFor="password">{t("auth.password")}</label>
                  <input id="password" className="input" type="password" required autoComplete="new-password"
                    aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "password-error" : undefined}
                    value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
                  {fieldError("password")}
                </div>
                <div>
                  <label className="label" htmlFor="confirm-password">{t("auth.confirmPassword")}</label>
                  <input id="confirm-password" className="input" type="password" required autoComplete="new-password"
                    aria-invalid={!!fieldErrors.confirm} aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
                    value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
                  {fieldError("confirm")}
                </div>
                {error && <p className="error m-0" role="alert">{error}</p>}
                <button className="btn btn-primary w-full" disabled={busy || !configured}>{t("auth.signUp")}</button>
              </form>
            )}
            {!checkEmail && (
              <div className="flex flex-col items-center gap-1 mt-4">
                <Link to="/login" className={textLink}>{t("auth.haveAccount")}</Link>
              </div>
            )}
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
