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

// The assistant text the customer read just before their current message: the consecutive assistant
// messages right before the customer's current turn. The current turn is the last customer message that
// is not a server retry note, together with any customer messages just before it.
export function assistantBeforeCurrentTurn(history: HistoryTurn[]): string {
  let cur = history.length - 1;
  while (cur >= 0 && !(history[cur].role === "user" && !history[cur].text.startsWith(CORRECTION_MARK))) cur--;
  if (cur < 0) return "";
  let j = cur;
  while (j - 1 >= 0 && history[j - 1].role === "user") j--;
  const parts: string[] = [];
  for (let k = j - 1; k >= 0 && history[k].role === "assistant"; k--) parts.unshift(history[k].text);
  return parts.join("\n");
}

// Per-run state shared by the tool calls of one agent run.
export interface RunState {
  // A quote_delivery was requested in this run (set before the round's tools run).
  quoteRequested: boolean;
}
