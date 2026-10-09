import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import type { Dict, Key } from "./locales/app/en";
import type { LandingDict } from "./locales/landing/types";

export type Lang = "en" | "fr" | "ar";
export const LANGS: { code: Lang; label: string }[] = [
  { code: "ar", label: "العربية" },
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
];

export type TKey = Key;

// Each locale is its own chunk. A visitor downloads only the app strings they use, and the public
// landing never loads the app strings at all (see LANDING_PATH below).
const appLoaders: Record<Lang, () => Promise<{ default: Dict }>> = {
  ar: () => import("./locales/app/ar"),
  fr: () => import("./locales/app/fr"),
  en: () => import("./locales/app/en"),
};
const landingLoaders: Record<Lang, () => Promise<{ default: LandingDict }>> = {
  ar: () => import("./locales/landing/ar"),
  fr: () => import("./locales/landing/fr"),
  en: () => import("./locales/landing/en"),
};

const appCache = new Map<Lang, Promise<Dict>>();
export function loadAppStrings(lang: Lang): Promise<Dict> {
  let p = appCache.get(lang);
  if (!p) { p = appLoaders[lang]().then((m) => m.default); appCache.set(lang, p); }
  return p;
}

// Cached promise per locale, so React's `use()` can suspend on it.
const landingCache = new Map<Lang, Promise<LandingDict>>();
export function loadLanding(lang: Lang): Promise<LandingDict> {
  let p = landingCache.get(lang);
  if (!p) { p = landingLoaders[lang]().then((m) => m.default); landingCache.set(lang, p); }
  return p;
}

// The landing copy for the locale of the current landing route, provided by LandingRoute.
export const LandingCopy = createContext<LandingDict | null>(null);
export function useLandingCopy(): LandingDict {
  const v = useContext(LandingCopy);
  if (!v) throw new Error("useLandingCopy outside LandingRoute");
  return v;
}

type I18n = { lang: Lang; setLang: (l: Lang) => void; t: (key: TKey, vars?: Record<string, string | number>) => string };
const Ctx = createContext<I18n | null>(null);

// Matches the landing paths: /, /fr, /en (with or without a trailing slash).
export const LANDING_PATH = /^\/(fr|en)?\/?$/;

export function applyDocumentLang(lang: Lang) {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
}

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem("lang");
    if (saved === "en" || saved === "fr" || saved === "ar") return saved;
  } catch { /* storage unavailable */ }
  const nav = (navigator.language || "en").slice(0, 2);
  return nav === "ar" || nav === "fr" ? nav : "en";
}

// Mounted inside the router, so it knows the current path. On landing paths it loads no app strings.
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);
  const [loaded, setLoaded] = useState<{ lang: Lang; dict: Dict } | null>(null);
  const onLanding = LANDING_PATH.test(useLocation().pathname);

  useEffect(() => {
    // The landing pages (/, /fr, /en) set their own language from the URL.
    if (onLanding) return;
    applyDocumentLang(lang);
  }, [lang, onLanding]);

  useEffect(() => {
    if (onLanding) return;
    let cancelled = false;
    loadAppStrings(lang).then((dict) => { if (!cancelled) setLoaded({ lang, dict }); });
    return () => { cancelled = true; };
  }, [lang, onLanding]);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem("lang", l); } catch { /* ignore */ }
  }, []);

  const dict = loaded && loaded.lang === lang ? loaded.dict : null;

  const value = useMemo<I18n>(() => ({
    lang,
    setLang,
    t: (key, vars) => {
      let s: string = dict?.[key] ?? key;
      if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, String(v));
      return s;
    },
  }), [lang, setLang, dict]);

  // App pages wait for their strings, so no raw keys are ever shown.
  if (!onLanding && !dict) return null;
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside I18nProvider");
  return v;
}
