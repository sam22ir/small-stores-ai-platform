import type { ProductRecord } from "../types.ts";
import { money, truncate } from "./shared.ts";

// Exact counts are internal business data, so the model only sees a count when
// stock is low enough that "only N left" is useful to the customer.
export const LOW_STOCK_THRESHOLD = 5;

export type Availability = "in_stock" | "low_stock" | "out_of_stock";

export function availability(quantity: number): Availability {
  if (quantity <= 0) return "out_of_stock";
  return quantity <= LOW_STOCK_THRESHOLD ? "low_stock" : "in_stock";
}
export function isSoldOut(p: ProductRecord, now: Date): boolean {
  return !!p.sold_out_until && new Date(p.sold_out_until) > now;
}

export function productView(p: ProductRecord, currency: string, now: Date, withIds = false) {
  // "Sold out today" overrides the stock count without erasing it.
  const soldOut = isSoldOut(p, now);
  const variants = p.variants.map((v) => {
    const a = soldOut ? "out_of_stock" as const : availability(v.stock_quantity);
    return {
      ...(withIds ? { variant_id: v.id } : {}),
      option: v.label,
      price: v.price_cents !== null && v.price_cents !== p.price_cents
        ? money(v.price_cents, currency)
        : undefined,
      availability: a,
      units_left: a === "low_stock" ? v.stock_quantity : undefined,
    };
  });
  const anyInStock = !soldOut && p.variants.some((v) => v.stock_quantity > 0);
  return {
    product_id: p.id,
    name: p.name,
    description: truncate(p.description, 240),
    price: money(p.price_cents, currency),
    availability: anyInStock ? "available" : "out_of_stock",
    variants,
  };
}
