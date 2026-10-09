import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Alert } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useI18n } from "../lib/i18n";
import { AuthLayout, FormAlert, PasswordField, SubmitButton } from "../components/AuthLayout";
import { RouteButton } from "../components/wakil/RouteLink";

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
    <AuthLayout title={t("auth.resetTitle")} subtitle={!expired && !done ? t("auth.resetHelp") : undefined}>
      {loading && <p className="m-0 text-center text-soft">{t("common.loading")}</p>}
      {expired && (
        <div className="flex flex-col gap-4">
          <FormAlert tone="danger">{t("auth.linkExpired")}</FormAlert>
          <RouteButton to="/login" variant="primary" fullWidth>{t("auth.backToSignIn")}</RouteButton>
        </div>
      )}
      {!loading && (session || done) && (
        done ? (
          <FormAlert tone="success">{t("auth.passwordSaved")}</FormAlert>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            <PasswordField id="new-password" label={t("auth.newPassword")} value={password} onChange={setPassword}
              autoComplete="new-password" minLength={8} required />
            <PasswordField id="confirm-password" label={t("auth.confirmPassword")} value={confirm} onChange={setConfirm}
              autoComplete="new-password" minLength={8} required />
            {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
            <SubmitButton busy={busy}>{t("auth.savePassword")}</SubmitButton>
          </form>
        )
      )}
    </AuthLayout>
  );
}
