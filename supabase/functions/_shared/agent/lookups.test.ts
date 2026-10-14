import assert from "node:assert/strict";
import { test } from "node:test";
import { searchGroups } from "./search.ts";
import { buildSystemPrompt, lookupSection } from "./prompt.ts";
import { capLookupOutputs, lookupOutput } from "./tools.ts";
import { toLatinDarija } from "./run.ts";
import { hasArabicScript } from "./language.ts";
import type { StoreContext } from "./types.ts";

const matches = (name: string, query: string) =>
  searchGroups(query).some((g) => g.some((v) => name.toLowerCase().includes(v)));

test("the Arabic article glued to a word is ignored when matching", () => {
  assert.ok(matches("كاسكيطة كحلة", "الكاسكيطة الكحلة"));
  assert.ok(matches("قميص أبيض", "القميص"));
  assert.ok(matches("قميص أبيض", "والقميص"));
  assert.ok(matches("قميص أبيض", "بالقميص"));
  assert.ok(matches("قميص أبيض", "للقميص"));
  assert.ok(!matches("كاسكيطة كحلة", "الفستان"));
  assert.deepEqual(searchGroups("ال"), []);
});

const store = { name: "Demo Boutique", orders_enabled: true } as unknown as StoreContext;

test("order rules: collecting details is the assistant's job; handoff only in the listed cases", () => {
  const p = buildSystemPrompt(store);
  assert.match(p, /Collecting the order details is YOUR job, not the owner's/);
  assert.match(p, /Never hand off just to collect details/);
  assert.match(p, /accept Algerian formats with spaces, dots or a \+213 prefix/);
  assert.match(p, /Use handoff_to_owner for orders only when create_order fails twice, the wilaya isn't served, or the customer asks for a discount, an exchange or a custom order/);
  assert.match(p, /call quote_delivery for the wilaya, then write the order summary as a short list/);
});

test("lookup facts are listed only when there are some, and the newest are kept within about 1 KB", () => {
  assert.equal(lookupSection([]), "");
  const section = lookupSection(["Black Hoodie 4,500.00 DA: M variant_id v-123, in_stock"]);
  assert.match(section, /Facts from your earlier lookups in this chat \(still valid unless the customer changes their mind\):/);
  assert.match(section, /variant_id v-123/);
  const capped = lookupSection(Array.from({ length: 40 }, (_, i) => `line ${i} ${"x".repeat(80)}`));
  assert.ok(capped.length <= 1000);
  assert.match(capped, /line 39 /);
  assert.doesNotMatch(capped, /line 0 /);
});

test("a successful lookup is saved as compact text; errors and empty results are not", () => {
  const content = JSON.stringify({
    results: [{
      product_id: "p1",
      name: "Black Hoodie",
      price: "4,500.00 DA",
      availability: "available",
      variants: [
        { variant_id: "v-123", option: "M", availability: "in stock" },
        { variant_id: "v-456", option: "L", price: "4,800.00 DA", availability: "few left" },
      ],
    }],
  });
  assert.equal(
    lookupOutput("search_products", {}, content),
    "Black Hoodie 4,500.00 DA: M variant_id v-123, in stock; L variant_id v-456, price 4,800.00 DA, few left",
  );
  assert.equal(lookupOutput("search_products", {}, JSON.stringify({ results: [] })), undefined);
  assert.equal(lookupOutput("create_order", {}, content), undefined);
  assert.equal(
    lookupOutput("quote_delivery", { wilaya: "Oran" }, JSON.stringify({ delivers: true, delivery_fee: "600.00 DA" })),
    "Delivery to Oran: 600.00 DA",
  );
  assert.equal(lookupOutput("quote_delivery", { wilaya: "Oran" }, JSON.stringify({ delivers: false })), undefined);
  assert.equal(lookupOutput("search_products", {}, "not json"), undefined);
  const big = lookupOutput("search_products", {}, JSON.stringify({
    results: Array.from({ length: 5 }, (_, i) => ({ name: `P${i} ${"x".repeat(200)}`, price: "1 DA", variants: [] })),
  }));
  assert.ok(big && big.length <= 500);
});

test("lookup outputs in one run are capped at 1500 characters, first come first kept", () => {
  const calls = Array.from({ length: 4 }, (_, i) => ({
    name: "search_products",
    input: {},
    is_error: false,
    output: "y".repeat(400) + i,
  }));
  const capped = capLookupOutputs(calls);
  assert.equal(capped.filter((c) => c.output !== undefined).length, 3);
  assert.equal(capped[3].output, undefined);
});

test("the Latin-Darija rewrite is used when clean, and the original is kept otherwise", async () => {
  const seen: string[] = [];
  const clean = await toLatinDarija("Hoodie noir 3500 DA, تمام", async (_s, user) => {
    seen.push(user);
    return "Hoodie noir 3500 DA, kayna. Bghiti tcommandi?";
  });
  assert.equal(clean, "Hoodie noir 3500 DA, kayna. Bghiti tcommandi?");
  assert.equal(seen.length, 1);

  const stillArabic = await toLatinDarija("Hoodie noir 3500 DA, تمام", async () => "كاينة");
  assert.equal(stillArabic, "Hoodie noir 3500 DA, تمام");

  const failed = await toLatinDarija("Hoodie noir 3500 DA, تمام", async () => {
    throw new Error("down");
  });
  assert.equal(failed, "Hoodie noir 3500 DA, تمام");

  let asked = false;
  const latin = await toLatinDarija("Hoodie noir 3500 DA, kayna", async () => {
    asked = true;
    return "x";
  });
  assert.equal(latin, "Hoodie noir 3500 DA, kayna");
  assert.equal(asked, false);
  assert.ok(hasArabicScript("تمام") && !hasArabicScript("tamam"));
});
