// Catalog search and stock wording, driven through the real port (supabaseCatalog) on the fake
// database, with the exact customer texts that failed in the stress run (PS-057, LG-032, NZ-037,
// PS-069, LG-023, PS-056) plus the typo and no-match paths.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { supabaseCatalog } from "../../supabase/functions/_shared/pipeline/ports.ts";
import { executeTool } from "../../supabase/functions/_shared/agent/tools/execute.ts";
import { createFakeDb } from "./fakedb.mjs";
import { buildState } from "./state.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(HERE, "fixture.json"), "utf8"));

function setup() {
  const state = buildState(fixture, "catalog-search-test");
  const db = createFakeDb(state.tables, { seed: "catalog-search-test" });
  const store = state.tables.stores[0];
  const catalog = supabaseCatalog(db);
  const ctx = {
    store: { id: store.id, name: store.name, currency: store.currency, business_info: null },
    catalog,
    now: new Date("2026-10-14T10:00:00Z"),
  };
  return { storeId: store.id, catalog, ctx };
}

const names = (products) => products.map((p) => p.name);

// The customer texts from the stress cases, each of which must find Basket blanche.
const SHOE_TEXTS = {
  "PS-057 shoes or hoodies": "salam, what kind of stuff you got? any shoes or hoodies? ya3tik sa7a",
  "LG-032 Arabic-Indic digits": "الحذاء ب ٦٥٠٠ ؟",
  "NZ-037 basquete 4z": "bnjr, jvw savoir si lé basquete 4z dispo sv",
  "PS-069 الصبادري": "عندي مقاس 42 في الصبادري، واش يناسبني؟",
  "LG-023 white shoe MSA": "السلام عليكم، أريد أن أعرف سعر الحذاء الأبيض",
};

for (const [label, text] of Object.entries(SHOE_TEXTS)) {
  test(`${label}: finds Basket blanche`, async () => {
    const { catalog, storeId } = setup();
    const found = names(await catalog.searchProducts(storeId, text, 5));
    assert.ok(found.includes("Basket blanche"), `got ${JSON.stringify(found)}`);
  });
}

test("PS-057 also finds the hoodie", async () => {
  const { catalog, storeId } = setup();
  const found = names(await catalog.searchProducts(storeId, SHOE_TEXTS["PS-057 shoes or hoodies"], 5));
  assert.ok(found.includes("Hoodie noir"));
});

test("typo fallback: kapucho finds the hoodie, a synonym typo finds the basket", async () => {
  const { catalog, storeId } = setup();
  assert.deepEqual(names(await catalog.searchProducts(storeId, "kapucho", 5)), ["Hoodie noir"]);
  assert.ok(names(await catalog.searchProducts(storeId, "basquet", 5)).includes("Basket blanche"));
});

test("a casquette query ranks the cap first, not the hoodie whose description has 'capuche'", async () => {
  const { catalog, storeId } = setup();
  const found = names(await catalog.searchProducts(storeId, "casquette", 5));
  assert.equal(found[0], "Casquette noire");
});

test("Arabic article and folded letters: الجينز and السروال find the jean", async () => {
  const { catalog, storeId } = setup();
  assert.ok(names(await catalog.searchProducts(storeId, "عندكم الجينز؟", 5)).includes("Jean slim bleu"));
  assert.ok(names(await catalog.searchProducts(storeId, "شحال السروال", 5)).includes("Jean slim bleu"));
});

test("no match at all: the result carries the catalog list and an instruction, not the owner", async () => {
  const { ctx } = setup();
  const out = JSON.parse((await executeTool("search_products", { query: "sac" }, ctx)).content);
  assert.deepEqual(out.results, []);
  assert.equal(out.catalog.length, 4);
  assert.ok(out.catalog.some((l) => l.startsWith("Basket blanche:")));
  assert.equal(out.catalog_more, undefined);
  assert.match(out.catalog_instruction, /before suggesting they ask the owner/);
});

test("PS-056 exact text: no match, so the four-product catalog list comes back", async () => {
  const { ctx } = setup();
  const out = JSON.parse((await executeTool("search_products", {
    query: "Vous vendez des vêtements ? Quels articles vous avez exactement",
  }, ctx)).content);
  assert.deepEqual(out.results, []);
  assert.equal(out.catalog.length, 4);
  assert.equal(out.catalog_more, undefined);
});

test("more than ten products: the list is cut to ten with 'and N more'", async () => {
  const many = Array.from({ length: 12 }, (_, i) => ({
    id: `p${i}`,
    name: `Item ${String(i).padStart(2, "0")}`,
    description: null,
    price_cents: 100000,
    aliases: null,
    sold_out_until: null,
    variants: [],
  }));
  const catalog = {
    searchProducts: async (_s, query) => (query === "" ? many : []),
    getProduct: async () => null,
  };
  const out = JSON.parse(
    (await executeTool("search_products", { query: "zzz" }, {
      store: { id: "s", name: "S", currency: "DZD", business_info: null },
      catalog,
    })).content,
  );
  assert.equal(out.catalog.length, 10);
  assert.equal(out.catalog_more, "and 2 more");
});

test("stock wording: 6 in size 41 is 'in stock', 1 in size 42 is 'few left', 0 is 'out of stock'", async () => {
  const { ctx } = setup();
  const out = JSON.parse((await executeTool("search_products", { query: "basquete" }, ctx)).content);
  const basket = out.results.find((r) => r.name === "Basket blanche");
  const level = Object.fromEntries(basket.variants.map((v) => [v.option, v.availability]));
  assert.deepEqual(level, { 41: "in stock", 42: "few left", 43: "out of stock" });
  const text = JSON.stringify(out);
  assert.ok(!/"units_left"/.test(text), "no unit counts in the result");
  assert.ok(!/\d+\s*(left|in stock)/.test(text), "no counts next to a stock word");
});
