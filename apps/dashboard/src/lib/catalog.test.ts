import assert from "node:assert/strict";
import { test } from "node:test";
import { planImportSave, isStale } from "./catalog.ts";
import type { ExistingProduct, Product } from "./catalog.ts";
import { groupRows, parseImport } from "./importer.ts";

const found: ExistingProduct = {
  id: "p1", name: "Black Hoodie", description: "Heavy cotton", aliases: null, price_cents: 450000, active: true, image_url: null,
  product_variants: [
    { id: "v1", label: "S", stock_quantity: 0, price_cents: null },
    { id: "v2", label: "M", stock_quantity: 3, price_cents: null },
    { id: "v3", label: "L", stock_quantity: 24, price_cents: 470000 },
  ],
};

const group = (csv: string) => groupRows(parseImport(csv).rows)[0];

test("an import that touches one option keeps the product's other variants", () => {
  const g = group("name, price, stock, option\nBlack Hoodie, , 5, M");
  const plan = planImportSave(found, g, "Default");
  assert.ok(plan);
  assert.equal(plan.created, false);
  assert.deepEqual(plan.variants, [
    { id: "v1", label: "S", stock_quantity: 0, price_cents: null },
    { id: "v2", label: "M", stock_quantity: 5, price_cents: null },
    { id: "v3", label: "L", stock_quantity: 24, price_cents: 470000 },
  ]);
});

test("an existing product keeps its name, description, aliases, price and active flag unless the import sets them", () => {
  const g = group("name, price, stock, option\nBlack Hoodie, , 5, M");
  const plan = planImportSave(found, g, "Default");
  assert.ok(plan);
  assert.deepEqual(plan.product, {
    name: "Black Hoodie", description: "Heavy cotton", aliases: null, price_cents: 450000, active: true, image_url: null,
  });
});

test("an import with a price, aliases and description updates them on the existing product", () => {
  const g = group("name, price, stock, option, description, aliases\nBlack Hoodie, 4800, 2, L, Soft, hoodie noir");
  const plan = planImportSave(found, g, "Default");
  assert.ok(plan);
  assert.equal(plan.product.price_cents, 480000);
  assert.equal(plan.product.description, "Soft");
  assert.equal(plan.product.aliases, "hoodie noir");
  assert.equal(plan.variants.find((v) => v.id === "v3")?.stock_quantity, 2);
  assert.equal(plan.variants.length, 3);
});

test("an unknown option is added as a new variant next to the existing ones", () => {
  const g = group("name, price, stock, option\nBlack Hoodie, , 7, XL");
  const plan = planImportSave(found, g, "Default");
  assert.ok(plan);
  assert.equal(plan.variants.length, 4);
  assert.deepEqual(plan.variants.at(-1), { label: "XL", stock_quantity: 7, price_cents: null });
  assert.ok(plan.variants.slice(0, 3).every((v) => v.id));
});

test("a single-variant product matches an import row with no option label", () => {
  const single: ExistingProduct = { ...found, product_variants: [{ id: "v9", label: "Brown", stock_quantity: 1, price_cents: 350000 }] };
  const plan = planImportSave(single, group("name, price, stock, option\nBlack Hoodie, , 4,"), "Default");
  assert.ok(plan);
  assert.deepEqual(plan.variants, [{ id: "v9", label: "Brown", stock_quantity: 4, price_cents: 350000 }]);
});

test("an import keeps the product photo, and a new product has none", () => {
  const photo = "https://x.test/storage/v1/object/public/product-images/s1/p.jpg";
  const plan = planImportSave({ ...found, image_url: photo }, group("name, price, stock, option\nBlack Hoodie, , 5, M"), "Default");
  assert.ok(plan);
  assert.equal(plan.product.image_url, photo);
  const created = planImportSave(undefined, group("name, price, stock, option\nSilk Scarf, 1500, 8, "), "Default");
  assert.ok(created);
  assert.equal(created.product.image_url, null);
});

test("a new product with no price is skipped, and a new product with a price is created with its options", () => {
  assert.equal(planImportSave(undefined, group("name, price, stock, option\nSilk Scarf, , 8, "), "Default"), null);
  const plan = planImportSave(undefined, group("name, price, stock, option\nSilk Scarf, 1500, 8, "), "Default");
  assert.ok(plan);
  assert.equal(plan.created, true);
  assert.deepEqual(plan.product, { name: "Silk Scarf", description: null, aliases: null, price_cents: 150000, active: true, image_url: null });
  assert.deepEqual(plan.variants, [{ label: "Default", stock_quantity: 8, price_cents: null }]);
});

test("isStale only flags active products whose numbers are older than the threshold", () => {
  const now = Date.parse("2026-10-11T12:00:00Z");
  const base: Product = {
    id: "p", name: "x", description: null, price_cents: 1, active: true, aliases: null,
    stock_checked_at: "2026-10-10T12:00:00Z", sold_out_until: null, image_url: null, product_variants: [],
  };
  assert.equal(isStale(base, 14, now), false);
  assert.equal(isStale({ ...base, stock_checked_at: "2026-09-01T00:00:00Z" }, 14, now), true);
  assert.equal(isStale({ ...base, active: false, stock_checked_at: "2026-09-01T00:00:00Z" }, 14, now), false);
});
