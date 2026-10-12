import { useEffect, useState } from "react";
import { Alert, Button, toast } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { CARD, SECTION_TITLE } from "./shared";

// Bot username (without @). When unset the Telegram card is hidden (see Settings).
export const TELEGRAM_BOT = ((import.meta.env.VITE_TELEGRAM_BOT_USERNAME as string | undefined) ?? "").trim();

export function TelegramAlerts({ storeId }: { storeId: string }) {
  const { t } = useI18n();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setBusy(true); setError(null);
    const { data, error: err } = await supabase.rpc("telegram_link", { p_store_id: storeId });
    if (err || !data) setError(t("common.error"));
    else { setConnected(data.connected); setCode(data.code); }
    setBusy(false);
  }

  useEffect(() => { void refresh(); }, [storeId]);

  async function disconnect() {
    setBusy(true); setError(null);
    const { error: err } = await supabase.rpc("telegram_unlink", { p_store_id: storeId });
    if (err) { setError(t("common.error")); toast.danger(t("common.error")); setBusy(false); return; }
    await refresh();
  }

  return (
    <section className={CARD}>
      <div>
        <h2 className={SECTION_TITLE}>{t("settings.tg.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{t("settings.tg.help")}</p>
      </div>
      {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
      {connected === true && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="rounded-full border-2 border-ink bg-slip px-3 py-1 text-sm font-bold text-ink">{t("settings.tg.connected")}</span>
          <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void disconnect()}>{t("settings.tg.disconnect")}</Button>
        </div>
      )}
      {connected === false && (
        <>
          <span className="w-fit rounded-full bg-surface-secondary px-3 py-1 text-sm font-semibold text-ink">{t("settings.tg.notConnected")}</span>
          <p className="m-0 text-[13px] text-soft">{t("settings.tg.open")}</p>
          <div>
            <Button variant="primary" isDisabled={busy || !code}
              onPress={() => window.open(`https://t.me/${TELEGRAM_BOT}?start=${code}`, "_blank", "noopener")}>
              {t("settings.tg.connect")}
            </Button>
          </div>
        </>
      )}
      <div>
        <Button size="sm" variant="outline" isDisabled={busy} onPress={() => void refresh()}>{t("settings.tg.refresh")}</Button>
      </div>
    </section>
  );
}
