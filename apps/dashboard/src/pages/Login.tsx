import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { Button, Input, Label, TextField } from "@heroui/react";
import { supabase, configured } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { AuthLayout, FormAlert, PasswordField, SubmitButton, useShake } from "../components/AuthLayout";

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
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const friendly = (err: { code?: string; message: string }) => (isRateLimited(err) ? t("auth.rateLimited") : err.message);
  const { session, loading } = useAuth();
  const [mode, setMode] = useState<Mode>("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [invalidCreds, setInvalidCreds] = useState(false);
  const { scope, shake } = useShake();

  if (!loading && session) return <Navigate to="/inbox" replace />;

  // Mode switches slide the form sideways; the direction flips for Arabic.
  const slide = lang === "ar" ? -1 : 1;

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
          options: { emailRedirectTo: `${window.location.origin}/login` },
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
          shake();
        }
      }
    } catch {
      setError(t("common.error"));
      shake();
    } finally {
      setBusy(false);
    }
  }

  const title = mode === "forgot" ? t("auth.forgot") : t("auth.signIn");

  const footer = (
    <div className="flex flex-col gap-1">
      {mode === "forgot" ? (
        <Button variant="ghost" className="justify-start px-0 text-blue" onPress={() => switchTo("in")}>
          {t("auth.backToSignIn")}
        </Button>
      ) : (
        <>
          <Button variant="ghost" className="justify-start px-0 text-blue" onPress={() => switchTo(mode === "link" ? "in" : "link")}>
            {mode === "link" ? t("auth.passwordMode") : t("auth.linkMode")}
          </Button>
          {mode !== "link" && (
            <Link to="/signup" className="rounded-wakil-sm px-0 py-2 text-sm font-semibold text-blue underline-offset-4 hover:underline">
              {t("auth.noAccount")}
            </Link>
          )}
        </>
      )}
    </div>
  );

  return (
    <AuthLayout title={title} subtitle={t("auth.subtitle")} footer={footer}>
      {!configured && <FormAlert tone="danger">{t("setup.missing")}</FormAlert>}
      <div ref={scope}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.form
            key={mode}
            onSubmit={submit}
            className="flex flex-col gap-4"
            initial={reduced ? false : { opacity: 0, x: 16 * slide }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 * slide }}
            transition={{ duration: dur.short, ease: ease.out }}
          >
            <TextField type="email" name="email" isRequired validationBehavior="aria" value={email} onChange={setEmail} className="w-full">
              <Label>{t("auth.email")}</Label>
              <Input id="email" autoComplete="email" dir="ltr" className="w-full transition-shadow duration-200" />
            </TextField>

            {mode === "link" && <p className="-mt-2 text-sm text-soft">{t("auth.linkHelp")}</p>}
            {mode === "forgot" && <p className="-mt-2 text-sm text-soft">{t("auth.forgotHelp")}</p>}

            {mode === "in" && (
              <PasswordField
                id="password"
                label={t("auth.password")}
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                minLength={8}
                required
                footer={
                  <div className="flex justify-end">
                    <Button variant="ghost" size="sm" className="text-blue" onPress={() => switchTo("forgot")}>
                      {t("auth.forgot")}
                    </Button>
                  </div>
                }
              />
            )}

            <AnimatePresence>
              {error && <FormAlert key="error" tone="danger">{error}</FormAlert>}
            </AnimatePresence>

            {invalidCreds && (
              <div className="rounded-wakil border border-ink/15 bg-paper p-4 text-sm text-soft">
                <p>{t("auth.joinedHint")}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onPress={() => switchTo("forgot")}>{t("auth.setPassword")}</Button>
                  <Button size="sm" variant="ghost" onPress={() => switchTo("link")}>{t("auth.linkMode")}</Button>
                </div>
              </div>
            )}

            <AnimatePresence>
              {notice && <FormAlert key="notice" tone="success">{notice}</FormAlert>}
            </AnimatePresence>

            <SubmitButton busy={busy} disabled={!configured}>
              {mode === "link" ? t("auth.sendLink")
                : mode === "forgot" ? t("auth.sendReset")
                : t("auth.signIn")}
            </SubmitButton>
          </motion.form>
        </AnimatePresence>
      </div>
    </AuthLayout>
  );
}
