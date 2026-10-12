import { useState } from "react";
import type { FormEvent } from "react";
import { useSearchParams } from "react-router-dom";
import { m } from "motion/react";
import { Alert, Button, toast } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import { useStore } from "../lib/store";
import { dur, ease, useMotionSafe } from "../lib/motion";
import { FaqEditor } from "../components/FaqEditor";
import { LangSwitch } from "../components/LangSwitch";
import { composeInfo, fieldsFromStore } from "../lib/storeInfo";
import type { InfoFields, InfoKey } from "../lib/storeInfo";
import { CARD, SECTION_TITLE, SavedCheck } from "../components/settings/shared";
import { AssistantFields, StoreFields } from "../components/settings/StoreSection";
import { BillingCard } from "../components/settings/BillingCard";
import { ReplyCreditsCard } from "../components/settings/ReplyCreditsCard";
import { PasswordCard } from "../components/settings/PasswordCard";
import { TELEGRAM_BOT, TelegramAlerts } from "../components/settings/TelegramAlerts";
import { DeliveryFees } from "../components/settings/DeliveryFees";
import { YalidineCard } from "../components/settings/YalidineCard";
import { AlertsCard } from "../components/settings/AlertsCard";

// Settings is split into tabs. Store and Assistant hold the store form (one Save bar); the other tabs
// have their own saves. Every panel stays mounted, so an unsaved store form survives a tab switch.
const TAB_IDS = ["store", "assistant", "delivery", "billing", "account"] as const;
type TabId = (typeof TAB_IDS)[number];
const STORE_TABS: TabId[] = ["store", "assistant"];

export function Settings() {
  const { t } = useI18n();
  const reduced = useMotionSafe();
  const { store, refresh } = useStore();
  const [params, setParams] = useSearchParams();
  const s = store!;
  const hasBilling = Boolean(s.trial_ends_at);
  const tabs = TAB_IDS.filter((id) => id !== "billing" || hasBilling);

  // ?tab= keeps the section in the URL. A Chargily return (?billing=...) opens the billing tab.
  const asked = params.get("tab") as TabId | null;
  const [tab, setTab] = useState<TabId>(() => {
    if (asked && tabs.includes(asked)) return asked;
    return hasBilling && params.get("billing") ? "billing" : "store";
  });

  function selectTab(id: TabId) {
    setTab(id);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("tab", id);
      return next;
    }, { replace: true });
  }

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
  // Bumped when Yalidine syncs fees, so DeliveryFees remounts and reloads its list.
  const [feesVersion, setFeesVersion] = useState(0);

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) { selectTab("store"); return; }
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

  // Inactive panels are hidden with classes (not the hidden attribute), so a Tailwind display class cannot override them.
  const show = (id: TabId, cls = "flex flex-col gap-4") => (tab === id ? cls : "hidden");
  const storeTab = STORE_TABS.includes(tab);

  return (
    <m.div
      className="mx-auto flex max-w-[760px] flex-col gap-4"
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      <h1 className="mb-0 mt-1 text-[22px] font-extrabold text-ink">{t("settings.title")}</h1>
      {/* Phone: a two-column grid, so every tab is visible without scrolling. Desktop: one row. */}
      <div role="tablist" aria-label={t("settings.tabs")} className="-mx-1 grid grid-cols-2 gap-2 px-1 py-1 lg:flex lg:overflow-x-auto">
        {tabs.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            id={`tab-${id}`}
            aria-selected={tab === id}
            aria-controls={`panel-${id}`}
            onClick={() => selectTab(id)}
            className={`min-h-11 w-full shrink-0 rounded-full border-2 border-ink px-4 text-sm font-bold lg:w-auto transition-colors duration-150 ${tab === id ? "bg-ink text-slip shadow-ink-sm" : "bg-slip text-ink hover:bg-ink/5"}`}
          >
            {t(`settings.tab.${id}`)}
          </button>
        ))}
      </div>

      <form onSubmit={save} noValidate className={storeTab ? "flex flex-col gap-4" : "hidden"}>
        <div role="tabpanel" id="panel-store" aria-labelledby="tab-store" className={show("store")}>
          <StoreFields
            name={name} onNameChange={setName}
            currency={currency} onCurrencyChange={setCurrency}
            timezone={timezone} onTimezoneChange={setTimezone}
          />
        </div>
        <div role="tabpanel" id="panel-assistant" aria-labelledby="tab-assistant" className={show("assistant")}>
          <AssistantFields
            info={info} onInfoChange={(k: InfoKey, v: string) => setInfo((f) => ({ ...f, [k]: v }))}
            agentOn={agentOn} onAgentChange={setEnabled}
            ordersOn={ordersOn} onOrdersChange={setOrdersOn}
          />
        </div>
        {error && <Alert status="danger"><Alert.Content><Alert.Description role="alert">{error}</Alert.Description></Alert.Content></Alert>}
        {/* Phone: a sticky bar just above the bottom nav (3.5rem tall plus its 2px top border), so Save stays in reach. Desktop: inline as before. */}
        <div data-testid="settings-save-bar" className="sticky bottom-[calc(3.5rem+2px+env(safe-area-inset-bottom))] z-30 -mx-4 flex flex-wrap items-center gap-3 border-t-2 border-ink bg-slip px-4 py-3 lg:static lg:z-auto lg:mx-0 lg:border-t-0 lg:bg-transparent lg:p-0">
          <Button type="submit" variant="primary" isDisabled={busy}>{t("common.save")}</Button>
          <SavedCheck show={saved} label={t("common.saved")} />
        </div>
      </form>
      {/* FAQ has its own dialog and saves, so it sits outside the store form. It shows with the assistant tab. */}
      <div className={show("assistant")}>
        <FaqEditor storeId={s.id} />
      </div>

      <div role="tabpanel" id="panel-delivery" aria-labelledby="tab-delivery" className={show("delivery")}>
        <YalidineCard storeId={s.id} currency={s.currency} onSynced={() => setFeesVersion((v) => v + 1)} />
        <DeliveryFees key={feesVersion} storeId={s.id} currency={s.currency} />
      </div>

      {hasBilling && (
        <div role="tabpanel" id="panel-billing" aria-labelledby="tab-billing" className={show("billing")}>
          <BillingCard store={s} />
          <ReplyCreditsCard store={s} />
        </div>
      )}

      <div role="tabpanel" id="panel-account" aria-labelledby="tab-account" className={show("account")}>
        <PasswordCard />
        <AlertsCard />
        {TELEGRAM_BOT && <TelegramAlerts storeId={s.id} />}
        <section className={CARD} aria-labelledby="sec-session">
          <h2 id="sec-session" className={SECTION_TITLE}>{t("settings.tab.account")}</h2>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-[15px] font-bold text-ink">{t("common.language")}</span>
            <LangSwitch />
          </div>
          <div>
            <Button variant="outline" className="font-semibold text-red" onPress={() => void supabase.auth.signOut()}>
              {t("auth.signOut")}
            </Button>
          </div>
        </section>
      </div>
    </m.div>
  );
}
