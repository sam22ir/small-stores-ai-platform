import { normalizeWilaya } from "../wilaya.ts";
import { money } from "./shared.ts";

// Compact delivery fee summary for get_store_info. One line per distinct fee, with the wilayas that have
// it. When the store lists all 58 wilayas, the most common fee is written once as "for all other wilayas"
// (true, since every wilaya is listed). A partial list names every wilaya, because "all other" would
// wrongly suggest that unlisted wilayas are served.
export function deliveryFeeSummary(
  rows: { wilaya: string; fee_cents: number }[],
  currency: string,
): Record<string, unknown> {
  if (rows.length === 0) {
    return {
      lines: [],
      note: "The owner hasn't set delivery fees. If the customer asks the price, say the owner will confirm it; don't invent a number.",
    };
  }
  const byFee = new Map<number, string[]>();
  for (const r of rows) byFee.set(r.fee_cents, [...(byFee.get(r.fee_cents) ?? []), r.wilaya]);
  // Most common fee first (ties: the lower fee), then the rest by price.
  const ordered = [...byFee].sort((a, b) => b[1].length - a[1].length || a[0] - b[0]);
  const [[commonFee, commonNames], ...others] = ordered;

  const codes = new Set(rows.map((r) => normalizeWilaya(r.wilaya)).filter((c): c is string => !!c));
  const listsAll = codes.size === 58;

  const lines = others
    .sort((a, b) => a[0] - b[0])
    .map(([fee, names]) => `${money(fee, currency)}: ${names.join(", ")}`);
  if (listsAll) {
    lines.push(`${money(commonFee, currency)} for all other wilayas`);
  } else {
    lines.push(`${money(commonFee, currency)}: ${commonNames.join(", ")}`);
  }
  return {
    lines,
    wilayas_listed: rows.length,
    note: listsAll
      ? "Answer delivery price questions from these lines. Call quote_delivery only when placing an order."
      : "Answer delivery price questions from these lines. Wilayas not listed are not served; call quote_delivery only when placing an order.",
  };
}
