import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { AuthLayout } from "../components/AuthLayout";

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

  const fieldError = (f: Field) => fieldErrors[f] && (
    <p className="wk-error" role="alert" id={`${f}-error`}>{fieldErrors[f]}</p>
  );

  const footer = !checkEmail ? (
    <div className="wk-foot">
      <Link to="/login" className="wk-text">{t("auth.haveAccount")}</Link>
    </div>
  ) : undefined;

  return (
    <AuthLayout title={t("auth.signUp")} subtitle={t("auth.subtitle")} footer={footer}>
      {!configured && <p className="wk-error" role="alert">{t("setup.missing")}</p>}
      {checkEmail ? (
        <div className="wk-form">
          <p className="wk-notice" role="status">{t("auth.checkEmail")}</p>
          <div className="wk-foot">
            <Link to="/login" className="wk-text">{t("auth.backToSignIn")}</Link>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="wk-form" noValidate>
          <div className="wk-field">
            <label className="wk-label" htmlFor="email">{t("auth.email")}</label>
            <input id="email" className="wk-input" type="email" autoComplete="email" required
              aria-invalid={!!fieldErrors.email} aria-describedby={fieldErrors.email ? "email-error" : undefined}
              value={email} onChange={(e) => setEmail(e.target.value)} dir="ltr" />
            {fieldError("email")}
          </div>
          <div className="wk-field">
            <label className="wk-label" htmlFor="password">{t("auth.password")}</label>
            <input id="password" className="wk-input" type="password" required autoComplete="new-password"
              aria-invalid={!!fieldErrors.password} aria-describedby={fieldErrors.password ? "password-error" : undefined}
              value={password} onChange={(e) => setPassword(e.target.value)} dir="ltr" />
            {fieldError("password")}
          </div>
          <div className="wk-field">
            <label className="wk-label" htmlFor="confirm-password">{t("auth.confirmPassword")}</label>
            <input id="confirm-password" className="wk-input" type="password" required autoComplete="new-password"
              aria-invalid={!!fieldErrors.confirm} aria-describedby={fieldErrors.confirm ? "confirm-error" : undefined}
              value={confirm} onChange={(e) => setConfirm(e.target.value)} dir="ltr" />
            {fieldError("confirm")}
          </div>
          {error && <p className="wk-error" role="alert">{error}</p>}
          <button className="btn btn-primary wk-submit" disabled={busy || !configured}>{t("auth.signUp")}</button>
        </form>
      )}
    </AuthLayout>
  );
}
