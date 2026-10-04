// Pure helpers for order taking: input normalization and the idempotency key.

// Algerian mobile numbers: 05/06/07 + 8 digits, written many ways:
// "0555 12 34 56", "+213 555 12 34 56", "00213555123456", "555123456".
export function normalizeDzPhone(raw: string): string | null {
  let d = raw.replace(/[\s.\-()]/g, "");
  // Arabic-Indic digits (٠-٩) and Eastern Arabic-Indic (۰-۹).
  d = d.replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x06f0));
  if (d.startsWith("+213")) d = d.slice(4);
  else if (d.startsWith("00213")) d = d.slice(5);
  else if (d.startsWith("213") && d.length === 12) d = d.slice(3);
  if (!/^\d+$/.test(d)) return null;
  if (d.length === 9) d = `0${d}`;
  return /^0[567]\d{8}$/.test(d) ? d : null;
}

// FNV-1a: small, synchronous and good enough to fold a string into a key.
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

// Same conversation + same basket + same phone on the same day = same order, so a model
// that calls create_order twice (retry, double confirmation) can't place it twice.
export function orderIdempotencyKey(
  conversationId: string,
  phone: string,
  items: { variant_id: string; quantity: number }[],
  now: Date,
): string {
  const basket = items
    .map((i) => `${i.variant_id}x${i.quantity}`)
    .sort()
    .join(",");
  const day = now.toISOString().slice(0, 10);
  return `${conversationId}:${day}:${fnv1a(`${phone}|${basket}`)}`;
}
