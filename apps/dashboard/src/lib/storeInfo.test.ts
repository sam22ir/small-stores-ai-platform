import assert from "node:assert/strict";
import { test } from "node:test";
import { EMPTY_FIELDS, composeInfo, fieldsFromStore, filledCount } from "./storeInfo.ts";

test("composes only the filled fields, labelled, with the free text last", () => {
  const text = composeInfo({
    ...EMPTY_FIELDS,
    hours: "Every day 10:00-18:00",
    payment: "Cash on delivery only",
    other: "We also do gift wrapping.",
  });
  assert.equal(text, "Opening hours: Every day 10:00-18:00\nPayment: Cash on delivery only\nWe also do gift wrapping.");
});

test("empty form composes to an empty string", () => {
  assert.equal(composeInfo(EMPTY_FIELDS), "");
  assert.equal(composeInfo({ ...EMPTY_FIELDS, hours: "   " }), "");
});

test("caps each field and the total so the prompt can't be flooded", () => {
  const long = "x".repeat(5000);
  const text = composeInfo({ hours: long, delivery: long, payment: long, returns: long, address: long, other: long });
  assert.ok(text.length <= 2000);
  assert.ok(text.startsWith(`Opening hours: ${"x".repeat(500)}\n`));
});

test("a store with only the old single text shows it under 'Anything else'", () => {
  const f = fieldsFromStore(null, "Open daily 10-18. Delivery 3-5 days.");
  assert.equal(f.other, "Open daily 10-18. Delivery 3-5 days.");
  assert.equal(f.hours, "");
});

test("saved fields are shown again as they were; bad data is ignored", () => {
  const f = fieldsFromStore({ hours: "9-5", delivery: 3, bogus: "x" }, "ignored");
  assert.equal(f.hours, "9-5");
  assert.equal(f.delivery, "");
  assert.equal(f.other, "");
  assert.deepEqual(fieldsFromStore([], "x"), { ...EMPTY_FIELDS, other: "x" });
});

test("counts how many fields are filled in", () => {
  assert.equal(filledCount(EMPTY_FIELDS), 0);
  assert.equal(filledCount({ ...EMPTY_FIELDS, hours: "9-5", other: "hi" }), 2);
});
