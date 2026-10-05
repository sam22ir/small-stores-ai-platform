// "What the assistant should know", as a few labelled fields instead of one big text box.
// The fields are composed into the plain text the assistant reads (stores.business_info) and
// also kept as JSON so the form can be shown again filled in.

export type InfoFields = {
  hours: string;
  delivery: string;
  payment: string;
  returns: string;
  address: string;
  other: string;
};

export const INFO_KEYS = ["hours", "delivery", "payment", "returns", "address", "other"] as const;
export type InfoKey = (typeof INFO_KEYS)[number];

export const EMPTY_FIELDS: InfoFields = { hours: "", delivery: "", payment: "", returns: "", address: "", other: "" };

// English labels on purpose: the assistant reads this text, whatever language the owner uses.
const LABELS: Record<Exclude<InfoKey, "other">, string> = {
  hours: "Opening hours",
  delivery: "Delivery",
  payment: "Payment",
  returns: "Returns and exchanges",
  address: "Address or pickup",
};

export const MAX_FIELD = 500;
export const MAX_OTHER = 1500;
export const MAX_TOTAL = 2000;

export function composeInfo(f: InfoFields): string {
  const lines: string[] = [];
  for (const key of ["hours", "delivery", "payment", "returns", "address"] as const) {
    const v = f[key].trim().slice(0, MAX_FIELD);
    if (v) lines.push(`${LABELS[key]}: ${v}`);
  }
  const other = f.other.trim().slice(0, MAX_OTHER);
  if (other) lines.push(other);
  return lines.join("\n").slice(0, MAX_TOTAL);
}

// Fields saved earlier, or for a store that only has the old single text: that text becomes
// "Anything else" so nothing the owner wrote is lost.
export function fieldsFromStore(fields: unknown, businessInfo: string | null): InfoFields {
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    const f = fields as Record<string, unknown>;
    const pick = (k: InfoKey) => (typeof f[k] === "string" ? (f[k] as string) : "");
    return { hours: pick("hours"), delivery: pick("delivery"), payment: pick("payment"), returns: pick("returns"), address: pick("address"), other: pick("other") };
  }
  return { ...EMPTY_FIELDS, other: businessInfo ?? "" };
}

// How much of the form is filled in (used by the setup checklist).
export function filledCount(f: InfoFields): number {
  return INFO_KEYS.filter((k) => f[k].trim().length > 0).length;
}
