import { test } from "node:test";
import assert from "node:assert/strict";
import { fitWithin, photoPathFromUrl } from "./image.ts";

test("photoPathFromUrl returns the storage path of a product photo", () => {
  assert.equal(
    photoPathFromUrl("https://x.supabase.co/storage/v1/object/public/product-images/s1/abc.jpg"),
    "s1/abc.jpg",
  );
  assert.equal(photoPathFromUrl("https://x.test/storage/v1/object/public/other/s1/abc.jpg"), null);
  assert.equal(photoPathFromUrl("https://x.test/storage/v1/object/public/product-images/"), null);
});

test("landscape photo: the width is the long side", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1200), { width: 1200, height: 900 });
});

test("portrait photo: the height is the long side", () => {
  assert.deepEqual(fitWithin(3000, 4000, 1200), { width: 900, height: 1200 });
});

test("square photo", () => {
  assert.deepEqual(fitWithin(2400, 2400, 1200), { width: 1200, height: 1200 });
});

test("a photo already within the limit is not upscaled", () => {
  assert.deepEqual(fitWithin(800, 600, 1200), { width: 800, height: 600 });
});

test("a photo exactly at the limit is unchanged", () => {
  assert.deepEqual(fitWithin(1200, 500, 1200), { width: 1200, height: 500 });
});

test("sides round to whole pixels", () => {
  assert.deepEqual(fitWithin(1000, 333, 500), { width: 500, height: 167 });
});

test("a very thin strip keeps at least one pixel per side", () => {
  assert.deepEqual(fitWithin(10000, 1, 1200), { width: 1200, height: 1 });
});
