import type { ImportProduct } from "./importer";

// Catalog types and pure helpers, shared by the Catalog page, its components and the import.
export type Variant = { id: string; label: string; price_cents: number | null; stock_quantity: number; sku: string | null; updated_at: string };
export type Product = {
  id: string; name: string; description: string | null; price_cents: number; active: boolean;
  aliases: string | null; stock_checked_at: string; sold_out_until: string | null; product_variants: Variant[];
};

// What the save_product RPC takes (see supabase/migrations/0024_dashboard_rpcs.sql). The product is the
// full state: a missing key is not "unchanged", so every field must be sent. Variants missing from the
// list are deleted, so every existing variant has to be sent back too.
export type SaveProduct = { name: string; description: string | null; aliases: string | null; price_cents: number; active: boolean };
export type SaveVariant = { id?: string; label: string; stock_quantity: number; price_cents: number | null };

// The fields the import needs from a product that already exists.
export type ExistingProduct = Pick<Product, "id" | "name" | "description" | "aliases" | "price_cents" | "active"> & {
  product_variants: Pick<Variant, "id" | "label" | "stock_quantity" | "price_cents">[];
};

const DAY = 86_400_000;

// The owner last confirmed or changed this product's numbers at (ms since epoch).
export function lastTouched(p: Product): number {
  return Math.max(new Date(p.stock_checked_at).getTime(), ...p.product_variants.map((v) => new Date(v.updated_at).getTime()));
}

export function isStale(p: Product, staleDays: number, now: number = Date.now()): boolean {
  return p.active && now - lastTouched(p) > staleDays * DAY;
}

export function isSoldOut(p: Product, now: number = Date.now()): boolean {
  return !!p.sold_out_until && new Date(p.sold_out_until).getTime() > now;
}

export type PlannedSave = { created: boolean; product: SaveProduct; variants: SaveVariant[] };

// Turns one imported product group into the save_product arguments.
// Returns null for a new product with no price (the import skips it and counts it as "no price").
// An existing product keeps every field and variant the import does not mention: its variants are all
// sent back with their current stock and price, and only matched options change.
export function planImportSave(found: ExistingProduct | undefined, g: ImportProduct, defaultLabel: string): PlannedSave | null {
  if (!found) {
    if (g.priceCents === null) return null;
    return {
      created: true,
      product: { name: g.name, description: g.description || null, aliases: g.aliases || null, price_cents: g.priceCents, active: true },
      variants: g.options.map((o) => ({ label: o.label || defaultLabel, stock_quantity: o.stock ?? 0, price_cents: o.priceCents })),
    };
  }

  const kept: SaveVariant[] = found.product_variants.map((v) => ({
    id: v.id, label: v.label, stock_quantity: v.stock_quantity, price_cents: v.price_cents,
  }));
  const added: SaveVariant[] = [];
  for (const o of g.options) {
    const label = o.label.trim().toLowerCase();
    const variant = label
      ? kept.find((v) => v.label.trim().toLowerCase() === label)
      : found.product_variants.length === 1 ? kept[0] : undefined;
    if (variant) {
      if (o.stock !== null) variant.stock_quantity = o.stock;
      if (o.priceCents !== null) variant.price_cents = o.priceCents;
    } else {
      added.push({ label: o.label || defaultLabel, stock_quantity: o.stock ?? 0, price_cents: o.priceCents });
    }
  }

  return {
    created: false,
    product: {
      name: found.name,
      description: g.description || found.description,
      aliases: g.aliases || found.aliases,
      price_cents: g.priceCents ?? found.price_cents,
      active: found.active,
    },
    variants: [...kept, ...added],
  };
}
