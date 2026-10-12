import { useState } from "react";
import { Switch } from "@heroui/react";
import { useI18n } from "../../lib/i18n";
import { NOTIFY_KEY, SOUND_KEY, readPref, writePref } from "../../lib/handoffAlerts";
import { CARD, SECTION_TITLE } from "./shared";

// Per-browser alerts for new handoffs. Telegram alerts are a separate card and are unchanged.
function notificationsSupported(): boolean {
  return typeof Notification !== "undefined";
}

// Switch row: label and help text, switch on the end (same look as the store settings toggles).
function AlertRow({ label, help, checked, onChange, disabled = false }: {
  label: string; help: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <Switch isSelected={checked} onChange={onChange} isDisabled={disabled} className="flex w-full items-start justify-between gap-4">
      <span className="min-w-0 flex-1">
        <Switch.Content className="block text-[15px] font-bold text-ink">{label}</Switch.Content>
        <span className="mt-1 block text-[13px] text-soft">{help}</span>
      </span>
      <Switch.Control><Switch.Thumb /></Switch.Control>
    </Switch>
  );
}

export function AlertsCard() {
  const { t } = useI18n();
  const [sound, setSound] = useState(() => readPref(SOUND_KEY));
  const [notify, setNotify] = useState(() => readPref(NOTIFY_KEY));
  const supported = notificationsSupported();
  const [hint, setHint] = useState<string | null>(() => {
    if (!supported) return t("alerts.unsupported");
    return Notification.permission === "denied" ? t("alerts.denied") : null;
  });

  function toggleSound(on: boolean) {
    writePref(SOUND_KEY, on);
    setSound(on);
  }

  function toggleNotify(on: boolean) {
    setHint(null);
    if (!on) {
      writePref(NOTIFY_KEY, false);
      setNotify(false);
      return;
    }
    if (!supported) { setHint(t("alerts.unsupported")); return; }
    const denied = () => { setNotify(false); setHint(t("alerts.denied")); };
    // Asked for here, inside the click, so the browser shows its prompt. It resolves at once when the
    // answer is already known.
    let pending: Promise<NotificationPermission>;
    try {
      pending = Notification.requestPermission();
    } catch {
      denied();
      return;
    }
    void Promise.resolve(pending).then((result) => {
      if (result === "granted") { writePref(NOTIFY_KEY, true); setNotify(true); }
      else denied();
    }, denied);
  }

  return (
    <section className={CARD} aria-labelledby="sec-alerts">
      <div>
        <h2 id="sec-alerts" className={SECTION_TITLE}>{t("alerts.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("alerts.help")}</p>
      </div>
      <AlertRow label={t("alerts.sound")} help={t("alerts.soundHelp")} checked={sound} onChange={toggleSound} />
      <AlertRow label={t("alerts.notify")} help={t("alerts.notifyHelp")} checked={notify} onChange={toggleNotify} disabled={!supported} />
      <p role="status" className="m-0 text-[13px] font-semibold text-red">{hint ?? ""}</p>
    </section>
  );
}
