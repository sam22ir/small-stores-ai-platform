import { useState } from "react";
import type { FormEvent } from "react";
import { Alert, Button, Input, Label, TextField, toast } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { CARD, SECTION_TITLE, SavedCheck } from "./shared";

// Lets owners who joined by email link set a password for password sign-in.
export function PasswordCard() {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    if (password.length < 8) { setError(t("auth.passwordRule")); return; }
    if (password !== confirm) { setError(t("auth.passwordMismatch")); return; }
    setBusy(true); setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) { setError(t("common.error")); toast.danger(t("common.error")); }
    else { setPassword(""); setConfirm(""); setSaved(true); toast.success(t("settings.pw.saved")); }
    setBusy(false);
  }

  return (
    <section className={CARD} aria-labelledby="sec-password">
      <div>
        <h2 id="sec-password" className={SECTION_TITLE}>{t("settings.pw.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("settings.pw.help")}</p>
      </div>
      <form onSubmit={save} className="flex flex-col gap-4">
        <TextField value={password} onChange={setPassword} isRequired minLength={8} className="w-full">
          <Label>{t("auth.newPassword")}</Label>
          <Input id="pw-new" type="password" autoComplete="new-password" dir="ltr" />
        </TextField>
        <TextField value={confirm} onChange={setConfirm} isRequired minLength={8} className="w-full">
          <Label>{t("auth.confirmPassword")}</Label>
          <Input id="pw-confirm" type="password" autoComplete="new-password" dir="ltr" />
        </TextField>
        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" isDisabled={busy}>{t("settings.pw.save")}</Button>
          <SavedCheck show={saved} label={t("settings.pw.saved")} />
        </div>
      </form>
    </section>
  );
}
