import type { ToolCallLog } from "../types.ts";
import { asRecord } from "./shared.ts";

// Facts from a successful lookup, saved with the run (tool_calls[].output) so the next turns can
// reuse variant ids, prices and delivery fees without searching again. Plain text, capped.
const LOOKUP_TOOLS = new Set(["search_products", "check_stock", "quote_delivery"]);
const LOOKUP_CALL_MAX = 500;
export const LOOKUP_RUN_MAX = 1500; // all lookups of one run together

export function lookupOutput(name: string, input: unknown, content: string): string | undefined {
  if (!LOOKUP_TOOLS.has(name)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return undefined;
  }
  const d = asRecord(parsed);
  let text: string;
  if (name === "quote_delivery") {
    if (d.delivers !== true) return undefined;
    const wilaya = typeof d.wilaya === "string" ? d.wilaya : String(asRecord(input).wilaya ?? "");
    text = `Delivery to ${wilaya}: ${d.delivery_fee}`;
  } else {
    const products = name === "check_stock" ? [d] : Array.isArray(d.results) ? d.results : [];
    const lines = products.map((p) => {
      const r = asRecord(p);
      const variants = (Array.isArray(r.variants) ? r.variants : []).map((v) => {
        const x = asRecord(v);
        const id = typeof x.variant_id === "string" ? ` variant_id ${x.variant_id}` : "";
        const price = typeof x.price === "string" ? `, price ${x.price}` : "";
        return `${String(x.option)}${id}${price}, ${String(x.availability)}`;
      });
      return `${String(r.name)} ${String(r.price)}: ${variants.join("; ")}`;
    });
    if (lines.length === 0) return undefined;
    text = lines.join(" | ");
  }
  return text.length > LOOKUP_CALL_MAX ? `${text.slice(0, LOOKUP_CALL_MAX - 1)}…` : text;
}

// Keeps the lookup outputs of one run within LOOKUP_RUN_MAX characters, first come first kept.
export function capLookupOutputs(calls: ToolCallLog[]): ToolCallLog[] {
  let used = 0;
  return calls.map((c) => {
    if (c.output === undefined) return c;
    if (used + c.output.length <= LOOKUP_RUN_MAX) {
      used += c.output.length;
      return c;
    }
    const { output: _dropped, ...rest } = c;
    return rest;
  });
}
