import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { FieldError, Input, Label, TextField } from "@heroui/react";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { AuthLayout, CheckEmailNotice, FormAlert, PasswordField, SubmitButton, useShake } from "../components/AuthLayout";

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
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const { scope, shake } = useShake();

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
    if (Object.keys(errs).length) { shake(); return; }
    setBusy(true);
    try {
      const { data, error: err } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (err) {
        setError(isAlreadyRegistered(err) ? t("auth.emailTaken") : isRateLimited(err) ? t("auth.rateLimited") : err.message);
        shake();
      } else if (data.session) {
        // Same place login sends a signed-in owner.
        navigate("/inbox", { replace: true });
      } else {
        // Email confirmation is on: no session until the owner opens the link.
        setCheckEmail(true);
      }
    } catch {
      setError(t("common.error"));
      shake();
    } finally {
      setBusy(false);
    }
  }

  const footer = !checkEmail ? (
    <div className="flex">
      <Link to="/login" className="rounded-wakil-sm py-2 text-sm font-semibold text-blue underline-offset-4 hover:underline">
        {t("auth.haveAccount")}
      </Link>
    </div>
  ) : undefined;

  const slide = lang === "ar" ? -1 : 1;
  const fieldError = (f: Field, id: string) => fieldErrors[f] && (
    <FieldError><span id={id}>{fieldErrors[f]}</span></FieldError>
  );

  return (
    <AuthLayout title={t("auth.signUp")} subtitle={t("auth.subtitle")} footer={footer}>
      {!configured && <FormAlert tone="danger">{t("setup.missing")}</FormAlert>}
      <AnimatePresence mode="wait" initial={false}>
        {checkEmail ? (
          <motion.div
            key="check"
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: dur.base, ease: ease.out }}
          >
            <CheckEmailNotice>{t("auth.checkEmail")}</CheckEmailNotice>
            <div className="mt-6 flex justify-center">
              <Link to="/login" className="rounded-wakil-sm py-2 text-sm font-semibold text-blue underline-offset-4 hover:underline">
                {t("auth.backToSignIn")}
              </Link>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            ref={scope}
            initial={reduced ? false : { opacity: 0, x: 16 * slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 * slide }}
            transition={{ duration: dur.short, ease: ease.out }}
          >
            <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
              <TextField type="email" name="email" isRequired isInvalid={!!fieldErrors.email} validationBehavior="aria" value={email} onChange={setEmail} className="w-full">
                <Label>{t("auth.email")}</Label>
                <Input id="email" autoComplete="email" dir="ltr" className="w-full transition-shadow duration-200" />
                {fieldError("email", "email-error")}
              </TextField>
              <PasswordField
                id="password"
                label={t("auth.password")}
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                required
                error={fieldErrors.password}
                errorId="password-error"
              />
              <PasswordField
                id="confirm-password"
                label={t("auth.confirmPassword")}
                value={confirm}
                onChange={setConfirm}
                autoComplete="new-password"
                required
                error={fieldErrors.confirm}
                errorId="confirm-error"
              />
              <AnimatePresence>
                {error && <FormAlert key="error" tone="danger">{error}</FormAlert>}
              </AnimatePresence>
              <SubmitButton busy={busy} disabled={!configured}>{t("auth.signUp")}</SubmitButton>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthLayout>
  );
}
