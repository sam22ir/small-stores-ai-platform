import { LANGS, useI18n } from "../lib/i18n";
import type { Lang } from "../lib/i18n";

export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      className="input"
      style={{ minHeight: 36, width: "auto", padding: ".25rem .5rem" }}
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t("common.language")}
    >
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
