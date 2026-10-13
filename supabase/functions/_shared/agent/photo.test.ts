import assert from "node:assert/strict";
import { test } from "node:test";
import type { Catalog, PhotoPort, ProductPhoto, ProductRecord, StoreContext } from "./types.ts";
import type { ToolContext } from "./tools/shared.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { executeTool, toolsForStore } from "./tools.ts";
import { isStorePhotoUrl, MAX_PHOTOS_PER_RUN, photoPrefix } from "./tools/photo.ts";

const BASE = "https://proj.supabase.co";
const STORE: StoreContext = { id: "s1", name: "Shop", currency: "DZD", business_info: null };
const photoOf = (store: string, file: string) => `${BASE}/storage/v1/object/public/product-images/${store}/${file}`;

function product(id: string, name: string, image_url: string | null): ProductRecord {
  return { id, name, description: null, price_cents: 1000, image_url, variants: [] };
}

// searchProducts returns the given products in order (the first is the best match).
function catalogWith(...products: ProductRecord[]): Catalog {
  return {
    searchProducts: async () => products,
    getProduct: async () => null,
  };
}

function ctxWith(catalog: Catalog, over: Partial<ToolContext> = {}): ToolContext {
  return {
    store: STORE,
    catalog,
    storageBase: BASE,
    conversationId: "c1",
    sentPhotos: [],
    photos: { sentUrls: async (): Promise<string[]> => [] } as PhotoPort,
    ...over,
  };
}

const ask = (name: string) => ({ product_name: name });

test("the photo of the best match is queued with the reply and named after the product", async () => {
  const url = photoOf("s1", "hoodie.jpg");
  const ctx = ctxWith(catalogWith(product("p1", "Black Hoodie", url)));
  const out = await executeTool("send_product_photo", ask("hoodie"), ctx);
  assert.equal(out.isError, undefined);
  assert.deepEqual(out.photos, [{ url, name: "Black Hoodie" }]);
  assert.deepEqual(ctx.sentPhotos, [{ url, name: "Black Hoodie" }]);
  assert.match(out.content, /will be sent with your reply/);
  assert.doesNotMatch(out.content, /https?:\/\//); // the model never gets the link to paste
});

test("at most two photos per reply: the third is refused", async () => {
  const ctx = ctxWith(catalogWith(product("p3", "Cap", photoOf("s1", "cap.jpg"))));
  ctx.sentPhotos = [
    { url: photoOf("s1", "a.jpg"), name: "A" },
    { url: photoOf("s1", "b.jpg"), name: "B" },
  ];
  assert.equal(ctx.sentPhotos.length, MAX_PHOTOS_PER_RUN);
  const out = await executeTool("send_product_photo", ask("cap"), ctx);
  assert.match(out.content, /Photo limit reached/);
  assert.equal(out.photos, undefined);
  assert.equal(ctx.sentPhotos.length, 2);
});

test("parallel calls in one round still respect the limit", async () => {
  // Each query finds its own product, so only the limit can stop the third.
  const catalog: Catalog = {
    searchProducts: async (_s, q) => [product(q, q, photoOf("s1", `${q}.jpg`))],
    getProduct: async () => null,
  };
  const ctx = ctxWith(catalog);
  const outs = await Promise.all(["a", "b", "c"].map((q) => executeTool("send_product_photo", ask(q), ctx)));
  assert.equal(outs.filter((o) => o.photos).length, MAX_PHOTOS_PER_RUN);
  assert.match(outs[2].content, /Photo limit reached/);
  assert.equal(ctx.sentPhotos?.length, MAX_PHOTOS_PER_RUN);
});

test("a photo already queued in this reply is not queued twice", async () => {
  const url = photoOf("s1", "hoodie.jpg");
  const ctx = ctxWith(catalogWith(product("p1", "Hoodie", url)));
  ctx.sentPhotos = [{ url, name: "Hoodie" }];
  const out = await executeTool("send_product_photo", ask("hoodie"), ctx);
  assert.match(out.content, /already queued/);
  assert.equal(out.photos, undefined);
});

test("a photo already sent in this chat is refused", async () => {
  const url = photoOf("s1", "hoodie.jpg");
  const ctx = ctxWith(catalogWith(product("p1", "Hoodie", url)), {
    photos: { sentUrls: async (conversationId) => (conversationId === "c1" ? [url] : []) },
  });
  const out = await executeTool("send_product_photo", ask("hoodie"), ctx);
  assert.match(out.content, /already sent/);
  assert.equal(out.photos, undefined);
  assert.deepEqual(ctx.sentPhotos, []);
});

test("a product without a photo says so, and the model is told to offer the description", async () => {
  const ctx = ctxWith(catalogWith(product("p1", "Hoodie", null)));
  const out = await executeTool("send_product_photo", ask("hoodie"), ctx);
  assert.match(out.content, /^no photo for this product/);
  assert.equal(out.isError, undefined);
  assert.deepEqual(ctx.sentPhotos, []);
});

test("a photo link outside this store's folder or host is refused like a missing photo", async () => {
  const links = [
    photoOf("s2", "hoodie.jpg"), // another store's folder
    "https://evil.example/storage/v1/object/public/product-images/s1/hoodie.jpg",
    `${BASE}/storage/v1/object/public/product-images/s1/hoodie.jpg?v=2`,
    photoOf("s1", "hoodie.webp"), // not a format Instagram accepts
    photoOf("s1", "x/../../other.jpg"),
  ];
  for (const link of links) {
    const ctx = ctxWith(catalogWith(product("p1", "Hoodie", link)));
    const out = await executeTool("send_product_photo", ask("hoodie"), ctx);
    assert.match(out.content, /^no photo for this product/, link);
    assert.deepEqual(ctx.sentPhotos, [], link);
  }
});

test("only the best match is used: a lower-ranked product's photo is never sent instead", async () => {
  const ctx = ctxWith(catalogWith(
    product("p1", "Black Hoodie", null),
    product("p2", "Hoodie Blue", photoOf("s1", "blue.jpg")),
  ));
  const out = await executeTool("send_product_photo", ask("hoodie"), ctx);
  assert.match(out.content, /^no photo for this product/);
  assert.deepEqual(ctx.sentPhotos, []);
});

test("no matching product is reported, not treated as a photo error", async () => {
  const ctx = ctxWith(catalogWith());
  const out = await executeTool("send_product_photo", ask("sneakers"), ctx);
  assert.match(out.content, /No matching product/);
});

test("an empty or missing product name is an error", async () => {
  const ctx = ctxWith(catalogWith());
  assert.equal((await executeTool("send_product_photo", { product_name: "  " }, ctx)).isError, true);
  assert.equal((await executeTool("send_product_photo", {}, ctx)).isError, true);
});

test("without a Supabase URL no photo can be checked, so none is sent", async () => {
  const ctx = ctxWith(catalogWith(product("p1", "Hoodie", photoOf("s1", "hoodie.jpg"))), { storageBase: undefined });
  const out = await executeTool("send_product_photo", ask("hoodie"), ctx);
  assert.match(out.content, /^no photo for this product/);
});

test("photoPrefix and isStorePhotoUrl only accept plain jpeg or png files in the store's folder", () => {
  const prefix = photoPrefix(`${BASE}/`, "s1");
  assert.equal(prefix, `${BASE}/storage/v1/object/public/product-images/s1/`);
  assert.equal(photoPrefix(undefined, "s1"), null);
  assert.equal(photoPrefix("not a url", "s1"), null);
  assert.equal(isStorePhotoUrl(photoOf("s1", "a.JPG"), prefix), true);
  assert.equal(isStorePhotoUrl(photoOf("s1", "a.png"), prefix), true);
  assert.equal(isStorePhotoUrl(photoOf("s1", "a.gif"), prefix), false);
  assert.equal(isStorePhotoUrl(photoOf("s1", "a.jpg"), null), false);
  assert.equal(isStorePhotoUrl(`${photoOf("s1", "a.jpg")}#x`, prefix), false);
});

test("the photo type matches the queued shape", () => {
  const p: ProductPhoto = { url: photoOf("s1", "a.jpg"), name: "A" };
  assert.deepEqual(Object.keys(p).sort(), ["name", "url"]);
});

test("the photo tool is strict and offered to every store", () => {
  const tool = toolsForStore(STORE).find((t) => t.name === "send_product_photo");
  assert.ok(tool);
  assert.equal(tool.strict, true);
  assert.deepEqual(tool.input_schema.required, ["product_name"]);
  assert.equal((tool.input_schema as { additionalProperties?: boolean }).additionalProperties, false);
});

test("the prompt says when to send photos, the limit, and that history notes are never written", () => {
  const prompt = buildSystemPrompt(STORE);
  assert.match(prompt, /send_product_photo/);
  assert.match(prompt, /at most 2 photos per reply/);
  assert.match(prompt, /Never send photos unprompted/);
  assert.match(prompt, /Never write such notes yourself/);
});
