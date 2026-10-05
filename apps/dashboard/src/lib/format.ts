import type { Lang } from "./i18n";

const LOCALES: Record<Lang, string> = {
  en: "en",
  fr: "fr",
  ar: "ar-u-nu-latn", // Arabic text, Latin digits (what Algerians read on prices)
};

export function formatMoney(cents: number, currency: string, lang: Lang): string {
  const value = cents / 100;
  try {
    return new Intl.NumberFormat(LOCALES[lang], {
      style: "currency",
      currency,
      minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value} ${currency}`;
  }
}

// "4500" or "4 500,50" -> cents; null when it isn't a non-negative number.
export function parsePrice(input: string): number | null {
  const cleaned = input.replace(/[\s ]/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function parseStock(input: string): number | null {
  const cleaned = input.trim();
  if (!/^\d{1,7}$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  const v = cents / 100;
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

export function formatTime(iso: string | null, lang: Lang): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(LOCALES[lang], sameDay
    ? { hour: "2-digit", minute: "2-digit" }
    : { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(d);
}

export const LOW_STOCK = 5;

// "3 days ago" / "today" in the user's language.
export function formatAgo(iso: string, lang: Lang, now = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000);
  const rtf = new Intl.RelativeTimeFormat(LOCALES[lang], { numeric: "auto" });
  if (days < 7) return rtf.format(-Math.max(0, days), "day");
  if (days < 60) return rtf.format(-Math.floor(days / 7), "week");
  return rtf.format(-Math.floor(days / 30), "month");
}

export const STALE_DAYS = 14;
