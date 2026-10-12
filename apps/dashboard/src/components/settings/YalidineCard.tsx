import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Alert, Button, Input, Label, ListBox, Select, TextField } from "@heroui/react";
import { supabase } from "../../lib/supabase";
import { useI18n } from "../../lib/i18n";
import { formatTime } from "../../lib/format";
import { WILAYAS } from "../../lib/wilayas";
import { CARD, SECTION_TITLE } from "./shared";

type FeeType = "home" | "desk";
type Status =
  | { connected: false }
  | { connected: true; carrier: string; from_wilaya_id: number; fee_type: FeeType; last_synced_at: string | null; last_error: string | null };
type CarrierResult = { ok: true; added?: number; updated?: number; skipped?: number } | { ok: false; reason?: string };
type I18nT = ReturnType<typeof useI18n>["t"];
type Notice = { kind: "ok" | "error"; text: string };

// Every backend reason maps to a translated message. Unknown reasons fall back to "failed".
const ERROR_KEYS = {
  bad_credentials: "yalidine.err.bad_credentials",
  rate_limited: "yalidine.err.rate_limited",
  currency_mismatch: "yalidine.err.currency_mismatch",
  not_connected: "yalidine.err.not_connected",
  failed: "yalidine.err.failed",
} as const;

function errorText(t: I18nT, reason: string | null | undefined): string {
  return t(ERROR_KEYS[(reason ?? "") as keyof typeof ERROR_KEYS] ?? ERROR_KEYS.failed);
}

// Calls the delivery-carrier function the same way as instagram-connect. A non-2xx reply still carries
// {ok:false, reason} in its body, so the reason is read from the response when there is one.
async function callCarrier(body: Record<string, unknown>): Promise<CarrierResult> {
  const { data, error } = await supabase.functions.invoke("delivery-carrier", { body });
  if (error) {
    const res = (error as { context?: Response }).context;
    try {
      if (res && typeof res.json === "function") return (await res.json()) as CarrierResult;
    } catch {
      // not JSON: fall through to the generic failure
    }
    return { ok: false, reason: "failed" };
  }
  return (data ?? { ok: false, reason: "failed" }) as CarrierResult;
}

// Yalidine delivery fees: connect the account once, then sync its fees into the store's delivery fees.
export function YalidineCard({ storeId, currency, onSynced }: { storeId: string; currency: string; onSynced: () => void }) {
  const { t, lang } = useI18n();
  const dzd = currency === "DZD";
  const [status, setStatus] = useState<Status | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [apiId, setApiId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [wilaya, setWilaya] = useState<string | null>(null);
  const [feeType, setFeeType] = useState<FeeType>("home");

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc("carrier_status", { p_store_id: storeId });
    if (error) { setLoadFailed(true); return; }
    setLoadFailed(false);
    setStatus(data as unknown as Status);
  }, [storeId]);
  useEffect(() => { if (dzd) void load(); }, [dzd, load]);

  function resultText(r: { added?: number; updated?: number; skipped?: number }) {
    return t("yalidine.result", { added: r.added ?? 0, updated: r.updated ?? 0, skipped: r.skipped ?? 0 });
  }

  // The token leaves state as soon as the form is submitted; it is never kept or logged.
  async function connect(e: FormEvent) {
    e.preventDefault();
    const id = apiId.trim();
    const token = apiToken;
    const origin = wilaya === null ? 0 : Number(wilaya);
    if (!id || !token || !origin) return;
    setApiToken("");
    setBusy(true); setNotice(null);
    const r = await callCarrier({ action: "connect", store_id: storeId, api_id: id, api_token: token, from_wilaya_id: origin, fee_type: feeType });
    setBusy(false);
    if (r.ok) {
      setApiId("");
      setNotice({ kind: "ok", text: resultText(r) });
      await load();
      onSynced();
    } else {
      setNotice({ kind: "error", text: errorText(t, r.reason) });
    }
  }

  async function sync(overwrite: boolean) {
    if (overwrite && !window.confirm(t("yalidine.confirmOverwrite"))) return;
    setBusy(true); setNotice(null);
    const r = await callCarrier({ action: "sync", store_id: storeId, overwrite });
    setBusy(false);
    if (r.ok) {
      setNotice({ kind: "ok", text: resultText(r) });
      await load();
      onSynced();
    } else {
      setNotice({ kind: "error", text: errorText(t, r.reason) });
      await load();
    }
  }

  async function disconnect() {
    if (!window.confirm(t("yalidine.confirmDisconnect"))) return;
    setBusy(true); setNotice(null);
    const r = await callCarrier({ action: "disconnect", store_id: storeId });
    setBusy(false);
    if (r.ok) setNotice({ kind: "ok", text: t("yalidine.disconnected") });
    else setNotice({ kind: "error", text: errorText(t, r.reason) });
    await load();
  }

  const connected = status?.connected === true ? status : null;
  const formReady = !busy && apiId.trim() !== "" && apiToken !== "" && wilaya !== null;

  return (
    <section className={CARD} aria-labelledby="sec-yalidine">
      <div>
        <h2 id="sec-yalidine" className={SECTION_TITLE}>{t("yalidine.title")}</h2>
        <p className="mb-0 mt-1 text-[13px] text-soft">{dzd ? t("yalidine.help") : t("yalidine.currencyNote")}</p>
      </div>

      {dzd && loadFailed && <Alert status="danger"><Alert.Content><Alert.Description>{t("common.error")}</Alert.Description></Alert.Content></Alert>}
      {dzd && !loadFailed && status === null && <p className="m-0 text-[13px] text-soft">{t("common.loading")}</p>}

      {dzd && connected && (
        <div className="flex flex-col gap-3">
          <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[15px]">
            <dt className="font-semibold text-soft">{t("yalidine.origin")}</dt>
            <dd className="m-0 font-bold text-ink">{WILAYAS[connected.from_wilaya_id - 1] ?? String(connected.from_wilaya_id)}</dd>
            <dt className="font-semibold text-soft">{t("yalidine.feeType")}</dt>
            <dd className="m-0 font-bold text-ink">{connected.fee_type === "desk" ? t("yalidine.feeDesk") : t("yalidine.feeHome")}</dd>
            <dt className="font-semibold text-soft">{t("yalidine.lastSynced")}</dt>
            <dd className="m-0 font-bold text-ink">{connected.last_synced_at ? formatTime(connected.last_synced_at, lang) : t("yalidine.neverSynced")}</dd>
          </dl>
          {connected.last_error && <Alert status="warning"><Alert.Content><Alert.Description>{errorText(t, connected.last_error)}</Alert.Description></Alert.Content></Alert>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" isDisabled={busy} onPress={() => void sync(false)}>{t("yalidine.sync")}</Button>
            <Button variant="outline" isDisabled={busy} onPress={() => void sync(true)}>{t("yalidine.overwrite")}</Button>
            <Button variant="ghost" className="font-semibold text-red" isDisabled={busy} onPress={() => void disconnect()}>{t("yalidine.disconnect")}</Button>
          </div>
        </div>
      )}

      {dzd && status && !connected && (
        <form onSubmit={connect} className="flex flex-col gap-3" autoComplete="off">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField value={apiId} onChange={setApiId} autoComplete="off">
              <Label>{t("yalidine.apiId")}</Label>
              <Input autoComplete="off" />
            </TextField>
            <TextField value={apiToken} onChange={setApiToken} autoComplete="new-password">
              <Label>{t("yalidine.apiToken")}</Label>
              <Input type="password" autoComplete="new-password" />
            </TextField>
            <div className="flex flex-col gap-1.5">
              <Label>{t("yalidine.originWilaya")}</Label>
              <Select aria-label={t("yalidine.originWilaya")} selectedKey={wilaya} placeholder={t("yalidine.pickWilaya")}
                onSelectionChange={(k) => setWilaya(k == null ? null : String(k))} className="w-full">
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {WILAYAS.map((w, i) => <ListBox.Item key={String(i + 1)} id={String(i + 1)} textValue={w}>{w}<ListBox.ItemIndicator /></ListBox.Item>)}
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("yalidine.feeType")}</Label>
              <Select aria-label={t("yalidine.feeType")} selectedKey={feeType}
                onSelectionChange={(k) => setFeeType(k === "desk" ? "desk" : "home")} className="w-full">
                <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    <ListBox.Item id="home" textValue={t("yalidine.feeHome")}>{t("yalidine.feeHome")}<ListBox.ItemIndicator /></ListBox.Item>
                    <ListBox.Item id="desk" textValue={t("yalidine.feeDesk")}>{t("yalidine.feeDesk")}<ListBox.ItemIndicator /></ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          </div>
          <div>
            <Button type="submit" variant="primary" isDisabled={!formReady}>{t("yalidine.connect")}</Button>
          </div>
        </form>
      )}

      {dzd && busy && <p className="m-0 text-[13px] text-soft">{t("yalidine.working")}</p>}
      {notice && (
        <Alert status={notice.kind === "ok" ? "success" : "danger"}>
          <Alert.Content><Alert.Description role={notice.kind === "error" ? "alert" : "status"}>{notice.text}</Alert.Description></Alert.Content>
        </Alert>
      )}
    </section>
  );
}
