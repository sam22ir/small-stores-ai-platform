import { normalizeDzPhone, orderIdempotencyKey } from "../orders.ts";
import type { OrderLineInput } from "../types.ts";
import { isSoldOut } from "./catalog.ts";
import { amountShown, hasExplicitAffirmative, NOT_CONFIRMED_PREFIX } from "./order-guard.ts";
import { asRecord, money, UUID } from "./shared.ts";
import type { ToolContext, ToolOutcome } from "./shared.ts";

const ORDER_ERRORS: Record<string, string> = {
  wilaya_not_served:
    "The store doesn't deliver to that wilaya. Tell the customer and offer to ask the owner (handoff_to_owner).",
  unknown_variant:
    "One of the variant_id values is not valid. Call search_products for the product and retry create_order with the id of the variant from that result.",
  invalid: "The order details were rejected. Ask the customer to check them.",
};

function normalizeLabel(s: string): string {
  return s.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
}

const GUIDE_RETRY =
  "Call search_products for this product, then retry create_order with the variant's id exactly as that result returned it.";

// Finds the one variant a customer means by product name and label, using the same search
// as search_products. Orders only on exactly one active match; anything else asks the model to
// look the product up again.
async function resolveVariant(
  item: Record<string, unknown>,
  ctx: ToolContext,
  now: Date,
): Promise<{ id: string } | { error: string }> {
  const productName = typeof item.product_name === "string"
    ? item.product_name.trim().slice(0, 200)
    : "";
  if (!productName) {
    return { error: `variant_id must be the id from search_products. ${GUIDE_RETRY}` };
  }
  const label = typeof item.variant_label === "string" ? normalizeLabel(item.variant_label) : "";
  const want = normalizeLabel(productName);

  const found = await ctx.catalog.searchProducts(ctx.store.id, productName, 5);
  const matches: { id: string }[] = [];
  for (const p of found) {
    if (isSoldOut(p, now)) continue;
    const aliases = (p.aliases ?? "").split(",").map(normalizeLabel).filter(Boolean);
    if (normalizeLabel(p.name) !== want && !aliases.includes(want)) continue;
    for (const v of p.variants) {
      if (label && normalizeLabel(v.label) !== label) continue;
      matches.push({ id: v.id });
    }
  }

  const shown = label ? `"${productName}" in "${item.variant_label}"` : `"${productName}"`;
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    return { error: `No active product or variant matches ${shown}. ${GUIDE_RETRY}` };
  }
  return {
    error: `${shown} matches more than one variant. Ask the customer which option they want, then call search_products and use that variant's id.`,
  };
}

export async function createOrder(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const { store } = ctx;
  if (!store.orders_enabled || !ctx.orders || !ctx.conversationId || !ctx.customerId) {
    return { content: "Ordering is not available.", isError: true };
  }

  const name = typeof args.customer_name === "string" ? args.customer_name.trim() : "";
  const wilaya = typeof args.wilaya === "string" ? args.wilaya.trim() : "";
  const address = typeof args.address === "string" ? args.address.trim() : "";
  if (name.length < 2 || name.length > 120) {
    return { content: "customer_name is missing. Ask the customer for their full name.", isError: true };
  }
  const phone = typeof args.phone === "string" ? normalizeDzPhone(args.phone) : null;
  if (!phone) {
    return {
      content: "The phone number is not a valid Algerian mobile number (05/06/07 + 8 digits). Ask the customer to send it again.",
      isError: true,
    };
  }
  if (!wilaya || wilaya.length > 60) {
    return { content: "wilaya is missing. Ask the customer which wilaya.", isError: true };
  }
  if (address.length < 5 || address.length > 300) {
    return { content: "The address is missing or too short. Ask for the full delivery address.", isError: true };
  }

  // Merge repeated variants so one line can't smuggle past the per-line limit.
  const merged = new Map<string, number>();
  if (!Array.isArray(args.items) || args.items.length === 0 || args.items.length > 10) {
    return { content: "items must contain 1-10 entries.", isError: true };
  }
  const now = ctx.now ?? new Date();
  for (const raw of args.items) {
    const it = asRecord(raw);
    if (
      typeof it.quantity !== "number" || !Number.isInteger(it.quantity) ||
      it.quantity < 1 || it.quantity > 10
    ) {
      return {
        content: "Each item needs a variant_id from the tools and a quantity from 1 to 10.",
        isError: true,
      };
    }
    let variantId: string;
    if (typeof it.variant_id === "string" && UUID.test(it.variant_id)) {
      variantId = it.variant_id;
    } else {
      // An id the model made up: recover it from the product name and variant label.
      const resolved = await resolveVariant(it, ctx, now);
      if ("error" in resolved) return { content: resolved.error, isError: true };
      variantId = resolved.id;
    }
    merged.set(variantId, (merged.get(variantId) ?? 0) + it.quantity);
  }
  const items: OrderLineInput[] = [...merged].map(([variant_id, quantity]) => ({
    variant_id,
    quantity,
  }));
  if (items.some((i) => i.quantity > 10)) {
    return { content: "At most 10 units of one item per order. Offer to ask the owner for more.", isError: true };
  }

  // Same wilaya matching as quote_delivery: the store's own spelling, or refuse and ask.
  const quote = await ctx.orders.quoteDelivery(store.id, wilaya);
  if (!quote.served) {
    if (quote.reason === "ambiguous") {
      return {
        content: `"${wilaya}" could be more than one wilaya (${(quote.suggestions ?? []).join(" or ")}). The order is not created. Ask the customer which one they mean, then show the summary again.`,
        isError: true,
      };
    }
    if (quote.reason === "unknown") {
      return {
        content: `"${wilaya}" is not a wilaya name the store recognises. The order is not created. Ask the customer for the wilaya again.`,
        isError: true,
      };
    }
    return { content: ORDER_ERRORS.wilaya_not_served, isError: true };
  }
  const storeWilaya = quote.canonical ?? wilaya;

  // Confirmation guard: the customer must have read this total in the assistant message before their
  // current message. A quote made in this same turn (or a summary never shown) fails the check.
  const subtotal = await ctx.orders.priceBasket(store.id, items);
  if (subtotal === null) {
    return { content: ORDER_ERRORS.unknown_variant, isError: true };
  }
  const total = subtotal + (quote.fee_cents ?? 0);
  // Both are needed: the total in the last message the customer read (a unit price alone can match a
  // total when the fee is unset) and a delivery quote for this wilaya from an earlier turn.
  const quotedEarlier = (ctx.lookups ?? []).some((l) => l.startsWith(`Delivery to ${storeWilaya}:`));
  if (!quotedEarlier || !amountShown(ctx.lastAssistantText ?? "", total)) {
    const sameTurn = ctx.run?.quoteRequested
      ? " You quoted delivery in this same turn, so the customer has not seen the summary yet."
      : "";
    return {
      content: `${NOT_CONFIRMED_PREFIX}${sameTurn} The total is ${money(total, store.currency)}. Do not call create_order again in this turn. Reply to the customer with the order summary (items, delivery fee, total) and wait for their explicit confirmation in their next message. This is not a failure and not a reason to hand off.`,
      isError: true,
    };
  }

  // Third condition: the customer's current message must say yes. Details alone (name, phone, address,
  // wilaya) after a summary are not a confirmation, so the model asks again and waits.
  if (!hasExplicitAffirmative(ctx.customerText ?? "")) {
    return {
      content: `${NOT_CONFIRMED_PREFIX} The customer has not said yes to the order summary in their latest message (details alone are not a confirmation). Reply with the order summary again (items, delivery fee, total) and ask one short confirmation question in the customer's language, for example "Tconfirmi la commande?". Do not call create_order again in this turn. Wait for their explicit yes in their next message. This is not a failure and not a reason to hand off.`,
      isError: true,
    };
  }

  const result = await ctx.orders.placeOrder({
    storeId: store.id,
    conversationId: ctx.conversationId,
    customerId: ctx.customerId,
    customerName: name,
    phone,
    wilaya: storeWilaya,
    address,
    items,
    key: orderIdempotencyKey(ctx.conversationId, phone, storeWilaya, address, items, now),
  });

  if (!result.ok) {
    if (result.code === "insufficient_stock") {
      return {
        content: `Not enough stock${result.detail ? ` for ${result.detail}` : ""}. Tell the customer, check availability with check_stock and suggest what is available.`,
        isError: true,
      };
    }
    return { content: ORDER_ERRORS[result.code] ?? ORDER_ERRORS.invalid, isError: true };
  }

  return {
    content: JSON.stringify({
      order_placed: true,
      already_placed_earlier: result.duplicate,
      subtotal: money(result.subtotal_cents, store.currency),
      delivery_fee: money(result.delivery_fee_cents, store.currency),
      total_to_pay_on_delivery: money(result.total_cents, store.currency),
      note: "Tell the customer the order is received, the total to pay in cash on delivery, and that the owner will contact them to confirm. Don't promise a delivery date.",
    }),
  };
}
