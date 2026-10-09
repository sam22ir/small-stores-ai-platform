import { useEffect } from "react";
import { applyDocumentLang, landing } from "../../lib/i18n";
import type { Lang } from "../../lib/i18n";

// Path for each landing locale. Arabic is the default at the root.
export const LOCALE_PATHS: Record<Lang, string> = { ar: "/", fr: "/fr", en: "/en" };
export const LANDING_LOCALES: Lang[] = ["ar", "fr", "en"];

function upsert(selector: string, create: () => HTMLElement): HTMLElement {
  let el = document.head.querySelector<HTMLElement>(selector);
  if (!el) {
    el = create();
    document.head.appendChild(el);
  }
  return el;
}

function setMeta(attr: "name" | "property", key: string, content: string) {
  const el = upsert(`meta[${attr}="${key}"]`, () => {
    const m = document.createElement("meta");
    m.setAttribute(attr, key);
    return m;
  });
  el.setAttribute("content", content);
}

function setLink(rel: string, href: string, hreflang?: string) {
  const sel = hreflang ? `link[rel="${rel}"][hreflang="${hreflang}"]` : `link[rel="${rel}"]`;
  const el = upsert(sel, () => {
    const l = document.createElement("link");
    l.setAttribute("rel", rel);
    if (hreflang) l.setAttribute("hreflang", hreflang);
    return l;
  });
  el.setAttribute("href", href);
}

// Per-locale title, description, Open Graph, canonical and hreflang for the landing pages.
// When the visitor leaves for the login or dashboard pages, the title and the app's own
// language on <html> are put back.
export function useLandingHead(locale: Lang, appLang: Lang) {
  useEffect(() => {
    const d = landing[locale];
    const origin = window.location.origin;
    const url = `${origin}${LOCALE_PATHS[locale]}`;
    const prevTitle = document.title;

    document.title = d.title;
    document.documentElement.lang = d.htmlLang;
    document.documentElement.dir = d.dir;

    setMeta("name", "description", d.description);
    setMeta("property", "og:title", d.title);
    setMeta("property", "og:description", d.description);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:locale", d.ogLocale);
    setMeta("property", "og:url", url);
    setLink("canonical", url);

    for (const l of LANDING_LOCALES) {
      setLink("alternate", `${origin}${LOCALE_PATHS[l]}`, l);
    }
    setLink("alternate", `${origin}/`, "x-default");

    return () => {
      document.title = prevTitle;
      applyDocumentLang(appLang);
    };
  }, [locale]); // appLang is read once per visit; a change while the landing is open does not matter.
}
