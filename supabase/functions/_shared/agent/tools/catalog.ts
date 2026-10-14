import type { Catalog, ProductRecord } from "../types.ts";
import { money, truncate } from "./shared.ts";

// Exact counts are internal business data. The tool only tells the model a level:
// out of stock (0), few left (1 to 3) or in stock (more than 3). Never a number.
export const LOW_STOCK_THRESHOLD = 3;

export type Availability = "in stock" | "few left" | "out of stock";

export function availability(quantity: number): Availability {
  if (quantity <= 0) return "out of stock";
  return quantity <= LOW_STOCK_THRESHOLD ? "few left" : "in stock";
}
export function isSoldOut(p: ProductRecord, now: Date): boolean {
  return !!p.sold_out_until && new Date(p.sold_out_until) > now;
}

export function productView(p: ProductRecord, currency: string, now: Date, withIds = false) {
  // "Sold out today" overrides the stock count without erasing it.
  const soldOut = isSoldOut(p, now);
  const variants = p.variants.map((v) => {
    const a: Availability = soldOut ? "out of stock" : availability(v.stock_quantity);
    return {
      ...(withIds ? { variant_id: v.id } : {}),
      option: v.label,
      price: v.price_cents !== null && v.price_cents !== p.price_cents
        ? money(v.price_cents, currency)
        : undefined,
      availability: a,
    };
  });
  const anyInStock = !soldOut && p.variants.some((v) => v.stock_quantity > 0);
  return {
    product_id: p.id,
    name: p.name,
    description: truncate(p.description, 240),
    price: money(p.price_cents, currency),
    availability: anyInStock ? "in stock" : "out of stock",
    variants,
  };
}

// No product matched the customer's words: the catalog list (names and prices only) goes into the
// result so the bot can offer it before it suggests the owner.
export const SUMMARY_MAX = 10;
const SUMMARY_POOL = 100;

export async function noMatchSummary(catalog: Catalog, storeId: string, currency: string) {
  const all = await catalog.searchProducts(storeId, "", SUMMARY_POOL);
  if (all.length === 0) return {};
  const more = all.length - SUMMARY_MAX;
  return {
    catalog: all.slice(0, SUMMARY_MAX).map((p) => `${p.name}: ${money(p.price_cents, currency)}`),
    ...(more > 0 ? { catalog_more: `and ${more} more` } : {}),
    catalog_instruction:
      "Offer this list of store products to the customer before suggesting they ask the owner.",
  };
}
