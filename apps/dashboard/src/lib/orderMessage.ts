// Pure helpers for sending an order confirmation to a customer on WhatsApp.

export type OrderItemForMessage = {
  name: string;
  variant_label: string;
  quantity: number;
  unit_price_cents: number;
};

export type OrderForMessage = {
  customer_name: string;
  wilaya: string;
  total_cents: number;
  order_items: OrderItemForMessage[];
};

export type MessageLabels = {
  greeting: (name: string) => string;
  items: string;
  wilaya: string;
  total: string;
};

// "0555 12 34 56" -> "213555123456"; "+213 555 12 34 56" -> same; null when it is not a usable number.
export function algerianWaNumber(phone: string): string | null {
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (/^0[567]\d{8}$/.test(digits)) return "213" + digits.slice(1);
  if (/^213[567]\d{8}$/.test(digits)) return digits;
  if (/^[1-9]\d{7,14}$/.test(digits)) return digits;
  return null;
}

export function whatsappUrl(phone: string, text: string): string | null {
  const number = algerianWaNumber(phone);
  return number ? `https://wa.me/${number}?text=${encodeURIComponent(text)}` : null;
}

export function buildOrderMessage(order: OrderForMessage, labels: MessageLabels, money: (cents: number) => string): string {
  const lines: string[] = [labels.greeting(order.customer_name), ""];
  lines.push(`${labels.items}:`);
  for (const i of order.order_items) {
    const variant = i.variant_label ? ` (${i.variant_label})` : "";
    lines.push(`- ${i.quantity} × ${i.name}${variant}: ${money(i.unit_price_cents * i.quantity)}`);
  }
  lines.push("");
  lines.push(`${labels.wilaya}: ${order.wilaya}`);
  lines.push(`${labels.total}: ${money(order.total_cents)}`);
  return lines.join("\n");
}
