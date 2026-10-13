import { useId } from "react";
import { Input, Label, ListBox, Select, Switch, TextArea, TextField } from "@heroui/react";
import { useI18n } from "../../lib/i18n";
import { INFO_KEYS, MAX_FIELD, MAX_OTHER } from "../../lib/storeInfo";
import type { InfoFields, InfoKey } from "../../lib/storeInfo";
import { CURRENCIES } from "../../pages/Onboarding";
import { CARD, SECTION_TITLE } from "./shared";

const ZONES = ["Africa/Algiers", "Africa/Casablanca", "Africa/Tunis", "Europe/Paris", "UTC"];

// Store-level switch row: label and help text, switch on the end. The label is the switch's accessible name.
function Toggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  const labelId = useId();
  const helpId = useId();
  return (
    <Switch isSelected={checked} onChange={onChange} aria-labelledby={labelId} aria-describedby={helpId}
      className="flex w-full items-start justify-between gap-4">
      <span className="min-w-0 flex-1">
        <Switch.Content className="block text-[15px] font-bold text-ink"><span id={labelId}>{label}</span></Switch.Content>
        <span id={helpId} className="mt-1 block text-[13px] text-soft">{help}</span>
      </span>
      <Switch.Control><Switch.Thumb /></Switch.Control>
    </Switch>
  );
}

// Store tab: name, currency, timezone. The parent Settings page owns the state, the <form> and the save bar.
export function StoreFields({ name, onNameChange, currency, onCurrencyChange, timezone, onTimezoneChange }: {
  name: string;
  onNameChange: (v: string) => void;
  currency: string;
  onCurrencyChange: (v: string) => void;
  timezone: string;
  onTimezoneChange: (v: string) => void;
}) {
  const { t } = useI18n();
  const currencies = CURRENCIES.includes(currency) ? CURRENCIES : [currency, ...CURRENCIES];
  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  return (
    <section className={CARD} aria-labelledby="sec-store">
      <h2 id="sec-store" className={SECTION_TITLE}>{t("settings.sec.store")}</h2>
      <TextField value={name} onChange={onNameChange} isRequired maxLength={100} className="w-full">
        <Label>{t("settings.name")}</Label>
        <Input id="sname" />
      </TextField>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{t("settings.currency")}</Label>
          <Select aria-label={t("settings.currency")} selectedKey={currency} onSelectionChange={(k) => onCurrencyChange(String(k))} className="w-full">
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {currencies.map((c) => <ListBox.Item key={c} id={c} textValue={c}>{c}<ListBox.ItemIndicator /></ListBox.Item>)}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("settings.timezone")}</Label>
          <Select aria-label={t("settings.timezone")} selectedKey={timezone} onSelectionChange={(k) => onTimezoneChange(String(k))} className="w-full">
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                {zones.map((z) => <ListBox.Item key={z} id={z} textValue={z}>{z}<ListBox.ItemIndicator /></ListBox.Item>)}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      </div>
    </section>
  );
}

// Assistant tab: what the assistant knows, whether it is on, and whether it takes orders.
export function AssistantFields({ info, onInfoChange, agentOn, onAgentChange, ordersOn, onOrdersChange, replyTone, onReplyToneChange, replyEmoji, onReplyEmojiChange }: {
  info: InfoFields;
  onInfoChange: (k: InfoKey, v: string) => void;
  agentOn: boolean;
  onAgentChange: (v: boolean) => void;
  ordersOn: boolean;
  onOrdersChange: (v: boolean) => void;
  replyTone: "friendly" | "formal";
  onReplyToneChange: (v: "friendly" | "formal") => void;
  replyEmoji: boolean;
  onReplyEmojiChange: (v: boolean) => void;
}) {
  const { t } = useI18n();
  return (
    <>
      <section className={CARD} aria-labelledby="sec-info">
        <div>
          <h2 id="sec-info" className={SECTION_TITLE}>{t("settings.info")}</h2>
          <p className="mb-0 mt-1 text-[13px] text-soft">{t("settings.infoHelp")}</p>
        </div>
        {INFO_KEYS.map((k) => (
          <TextField key={k} value={info[k]} className="w-full"
            onChange={(v) => onInfoChange(k as InfoKey, v)} maxLength={k === "other" ? MAX_OTHER : MAX_FIELD}>
            <Label>{t(`settings.f.${k}`)}</Label>
            <TextArea id={`info-${k}`} rows={k === "other" ? 4 : 2} placeholder={t(`settings.f.${k}Ph`)} />
          </TextField>
        ))}
      </section>

      <section className={CARD} aria-labelledby="sec-assistant">
        <h2 id="sec-assistant" className={SECTION_TITLE}>{t("assistant.title")}</h2>
        <Toggle checked={agentOn} onChange={onAgentChange} label={t("settings.agent")} help={t("settings.agentHelp")} />
        <div className="border-t border-ink/10 pt-4">
          <Toggle checked={ordersOn} onChange={onOrdersChange} label={t("settings.orders")} help={t("settings.ordersHelp")} />
        </div>
        <div className="flex flex-col gap-1.5 border-t border-ink/10 pt-4">
          <Label>{t("settings.tone")}</Label>
          <p className="mb-0 text-[13px] text-soft">{t("settings.toneHelp")}</p>
          <Select aria-label={t("settings.tone")} selectedKey={replyTone} onSelectionChange={(k) => onReplyToneChange(String(k) === "formal" ? "formal" : "friendly")} className="w-full sm:w-72">
            <Select.Trigger><Select.Value /><Select.Indicator /></Select.Trigger>
            <Select.Popover>
              <ListBox>
                <ListBox.Item id="friendly" textValue={t("settings.toneFriendly")}>{t("settings.toneFriendly")}<ListBox.ItemIndicator /></ListBox.Item>
                <ListBox.Item id="formal" textValue={t("settings.toneFormal")}>{t("settings.toneFormal")}<ListBox.ItemIndicator /></ListBox.Item>
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
        <div className="border-t border-ink/10 pt-4">
          <Toggle checked={replyEmoji} onChange={onReplyEmojiChange} label={t("settings.emoji")} help={t("settings.emojiHelp")} />
        </div>
      </section>
    </>
  );
}
