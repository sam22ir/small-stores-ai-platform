import { CORRECTION_MARK } from "../language.ts";

// create_order is refused until the customer has seen the total. The refusal starts with this prefix
// so the model (and the logs) can tell it apart from a real failure: it is not a reason to retry or hand off.
export const NOT_CONFIRMED_PREFIX = "[order not created: waiting for the customer's confirmation]";

// Arabic-Indic (U+0660-0669) and Eastern Arabic-Indic (U+06F0-06F9) digits, and Arabic separators.
function normalizeDigits(text: string): string {
  return text
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0))
    .replace(/٬/g, ",")
    .replace(/٫/g, ".");
}

// A number as the model writes it: "7700", "7 700", "7,700", "7.700", "7,700.00", "4 700,00".
// Groups of exactly three digits after a space, dot or comma are thousands separators; a final
// separator followed by one or two digits is the decimal part. Anything else stays separate numbers.
const AMOUNT = /\d{1,3}(?:[   .,]\d{3})+(?:[.,]\d{1,2})?(?!\d)|\d+(?:[.,]\d{1,2})?(?!\d)/g;

// Every amount in the text, in whole currency units (DZD).
export function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of normalizeDigits(text).match(AMOUNT) ?? []) {
    const dec = m.match(/[.,](\d{1,2})$/);
    const whole = dec ? m.slice(0, m.length - dec[0].length) : m;
    const digits = whole.replace(/\D/g, "");
    if (!digits) continue;
    out.push(Number(digits) + (dec ? Number(`0.${dec[1]}`) : 0));
  }
  return out;
}

// True when the text states the amount (in cents) as a number. Cents are compared as numbers, so
// "7700 DA", "7 700 DZD", "7.700 DA", "7,700.00 DZD", "4 700,00" and "٧٧٠٠ دج" all match 770000 cents.
export function amountShown(text: string, cents: number): boolean {
  return amountsIn(text).some((n) => Math.abs(n * 100 - cents) < 0.5);
}

interface HistoryTurn {
  role: string;
  text: string;
}

// The current turn: the last customer message that is not a server retry note, and the first of the
// consecutive customer messages right before it. cur is -1 when the customer has not written yet.
function currentTurn(history: HistoryTurn[]): { cur: number; start: number } {
  let cur = history.length - 1;
  while (cur >= 0 && !(history[cur].role === "user" && !history[cur].text.startsWith(CORRECTION_MARK))) cur--;
  if (cur < 0) return { cur, start: cur };
  let start = cur;
  while (start - 1 >= 0 && history[start - 1].role === "user") start--;
  return { cur, start };
}

// The assistant text the customer read just before their current message: the consecutive assistant
// messages right before the customer's current turn.
export function assistantBeforeCurrentTurn(history: HistoryTurn[]): string {
  const { cur, start } = currentTurn(history);
  if (cur < 0) return "";
  const parts: string[] = [];
  for (let k = start - 1; k >= 0 && history[k].role === "assistant"; k--) parts.unshift(history[k].text);
  return parts.join("\n");
}

// The customer's words in the current turn: their consecutive messages joined, without server retry notes.
export function currentCustomerText(history: HistoryTurn[]): string {
  const { cur, start } = currentTurn(history);
  if (cur < 0) return "";
  const parts: string[] = [];
  for (let k = start; k <= cur; k++) {
    if (history[k].role === "user" && !history[k].text.startsWith(CORRECTION_MARK)) parts.push(history[k].text);
  }
  return parts.join(" \n ");
}

// Lowercased words without accents, diacritics or tatweel. Anything that is not a letter or a digit
// separates words, so "d'accord" and "vas-y" split in two. NFKD folds Arabic hamza forms to one spelling.
export function normalizeWords(text: string): string[] {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ـ/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

// Explicit yes, as the customer writes it. Each entry is one word or phrase, matched as whole words.
const AFFIRMATIVE_PHRASES = [
  // English
  "yes", "yeah", "yep", "ok", "okay", "confirm", "confirmed", "sure", "go ahead", "place it", "validate", "proceed",
  // French
  "oui", "ouais", "d accord", "daccord", "ok", "confirme", "je confirme", "valide", "vas y", "c est bon", "parfait",
  // Algerian Darija in Latin letters
  "iyeh", "iyeh confirmi", "ey", "eyh", "ah", "wakha", "wah", "nakedh", "nakdh", "confirmi", "aywa", "ewa",
  "normal", "tamam", "yalah", "yallah", "3am", "sah",
  // Arabic script
  "نعم", "اي", "ايه", "إيه", "أيوه", "اه", "آه", "أكيد", "اؤكد", "أؤكد", "تمام", "واخا", "موافق", "مؤكد",
  "خلاص", "اوكي", "اوكيه",
  // "no problem" forms, which are yeses
  "pas de souci", "pas de probleme", "machi mochkil", "machi mouchkil", "لا مشكل", "لا باس",
];

// A refusal phrase in the same message cancels the yes ("je confirme pas", "machi daccord"). Phrases,
// not single words: "no problem" or "pas de souci" are yeses.
const NEGATIVE_PHRASES = [
  "confirme pas", "valide pas", "pas d accord", "machi daccord", "mch daccord", "pas confirme",
  "ma nconfirmich", "non merci", "nconfirmich pas", "ma validich",
];

const AFFIRMATIVES = AFFIRMATIVE_PHRASES.map(normalizeWords);
const NEGATIVES = NEGATIVE_PHRASES.map(normalizeWords);

// True when the phrase occurs as whole words in the list of words.
function hasPhrase(words: string[], phrase: string[]): boolean {
  return words.some((_, i) => phrase.every((w, k) => words[i + k] === w));
}

// True when the customer's own words hold an explicit yes. Bracketed notes such as "[image]" are not
// the customer's words. Digits, names, phone numbers and addresses alone never count.
export function hasExplicitAffirmative(text: string): boolean {
  const own = text.replace(/\[[^\]]*\]/g, " ");
  // A question is not a yes ("ok, which sizes?"); the customer is asking, so the model asks again.
  if (/[?؟]/.test(own)) return false;
  const words = normalizeWords(own);
  if (NEGATIVES.some((phrase) => hasPhrase(words, phrase))) return false;
  return AFFIRMATIVES.some((phrase) => hasPhrase(words, phrase));
}

// Per-run state shared by the tool calls of one agent run.
export interface RunState {
  // A quote_delivery was requested in this run (set before the round's tools run).
  quoteRequested: boolean;
}
