import { useState } from "react";
import type { FormEvent } from "react";
import { m } from "motion/react";
import { Alert, Button, toast } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { FaqEditor } from "../components/FaqEditor";
import { composeInfo, fieldsFromStore } from "../lib/storeInfo";
import type { InfoFields, InfoKey } from "../lib/storeInfo";
import { SavedCheck } from "../components/settings/shared";
import { StoreSection } from "../components/settings/StoreSection";
import { BillingCard } from "../components/settings/BillingCard";
import { ReplyCreditsCard } from "../components/settings/ReplyCreditsCard";
import { PasswordCard } from "../components/settings/PasswordCard";
import { TELEGRAM_BOT, TelegramAlerts } from "../components/settings/TelegramAlerts";
import { DeliveryFees } from "../components/settings/DeliveryFees";

// Page shell: owns the store fields and the one save bar. Each card is its own component.
export function Settings() {
  const { t } = useI18n();
  const reduced = useMotionSafe();
  const { store, refresh } = useStore();
  const s = store!;
  const [name, setName] = useState(s.name);
  const [currency, setCurrency] = useState(s.currency);
  const [timezone, setTimezone] = useState(s.timezone);
  const [info, setInfo] = useState<InfoFields>(() => fieldsFromStore(s.business_info_fields, s.business_info));
  // null = the owner has not touched this switch here, so it follows the store
  // (the header pause switch can change agent_enabled while this page is open).
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const agentOn = enabled ?? s.agent_enabled;
  const [ordersOn, setOrdersOn] = useState(s.orders_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setError(null); setSaved(false);
    const { error: err } = await supabase.from("stores").update({
      name: name.trim(), currency, timezone, business_info: composeInfo(info) || null, business_info_fields: info,
      orders_enabled: ordersOn,
      ...(enabled === null ? {} : { agent_enabled: enabled }),
    }).eq("id", s.id);
    if (err) { setError(t("common.error")); toast.danger(t("common.error")); }
    else { setEnabled(null); setSaved(true); toast.success(t("common.saved")); await refresh(); }
    setBusy(false);
  }

  return (
    <m.div
      className="mx-auto flex max-w-[760px] flex-col gap-4"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      <h1 className="mb-0 mt-1 text-[22px] font-extrabold text-ink">{t("settings.title")}</h1>
      <form onSubmit={save} className="flex flex-col gap-4">
        <StoreSection
          name={name} onNameChange={setName}
          currency={currency} onCurrencyChange={setCurrency}
          timezone={timezone} onTimezoneChange={setTimezone}
          info={info} onInfoChange={(k: InfoKey, v: string) => setInfo((f) => ({ ...f, [k]: v }))}
          agentOn={agentOn} onAgentChange={setEnabled}
          ordersOn={ordersOn} onOrdersChange={setOrdersOn}
        />
        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="primary" isDisabled={busy}>{t("common.save")}</Button>
          <SavedCheck show={saved} label={t("common.saved")} />
        </div>
      </form>
      {s.trial_ends_at && <BillingCard store={s} />}
      {s.trial_ends_at && <ReplyCreditsCard store={s} />}
      <PasswordCard />
      <FaqEditor storeId={s.id} />
      <DeliveryFees storeId={s.id} currency={s.currency} />
      {TELEGRAM_BOT && <TelegramAlerts storeId={s.id} />}
    </m.div>
  );
}
