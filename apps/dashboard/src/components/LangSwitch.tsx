import { LANGS, useI18n } from "../lib/i18n";
import type { Lang } from "../lib/i18n";

// Compact language picker: a pill with a native select inside, so keyboards and screen readers work as usual.
export function LangSwitch() {
  const { lang, setLang, t } = useI18n();
  return (
    <select
      className="min-h-9 rounded-full border-2 border-ink bg-slip px-3 py-1 text-sm font-semibold text-ink shadow-ink-sm focus-visible:outline-2 focus-visible:outline-blue"
      value={lang}
      onChange={(e) => setLang(e.target.value as Lang)}
      aria-label={t("common.language")}
    >
      {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
    </select>
  );
}
