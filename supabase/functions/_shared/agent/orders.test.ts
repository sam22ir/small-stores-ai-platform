import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeDzPhone, orderIdempotencyKey } from "./orders.ts";

test("normalizes Algerian mobile numbers written many ways", () => {
  for (
    const raw of [
      "0555123456",
      "0555 12 34 56",
      "+213 555 12 34 56",
      "+213555123456",
      "00213555123456",
      "213555123456",
      "555123456",
      "0555-12-34-56",
      "٠٥٥٥١٢٣٤٥٦", // Arabic-Indic digits
    ]
  ) {
    assert.equal(normalizeDzPhone(raw), "0555123456", raw);
  }
  assert.equal(normalizeDzPhone("0661234567"), "0661234567");
  assert.equal(normalizeDzPhone("0770000000"), "0770000000");
});

test("rejects numbers that are not Algerian mobiles", () => {
  for (
    const raw of ["", "abc", "0555", "0455123456", "021123456", "+33612345678", "05551234567", "0555 12 34 5x"]
  ) {
    assert.equal(normalizeDzPhone(raw), null, raw);
  }
});

test("idempotency key is stable for the same basket and differs otherwise", () => {
  const day = new Date("2026-10-04T10:00:00Z");
  const a = orderIdempotencyKey("c1", "0555123456", [
    { variant_id: "v1", quantity: 1 },
    { variant_id: "v2", quantity: 2 },
  ], day);
  const reordered = orderIdempotencyKey("c1", "0555123456", [
    { variant_id: "v2", quantity: 2 },
    { variant_id: "v1", quantity: 1 },
  ], day);
  assert.equal(a, reordered);
  assert.notEqual(
    a,
    orderIdempotencyKey("c1", "0555123456", [{ variant_id: "v1", quantity: 2 }], day),
  );
  assert.notEqual(a, orderIdempotencyKey("c2", "0555123456", [
    { variant_id: "v1", quantity: 1 },
    { variant_id: "v2", quantity: 2 },
  ], day));
  assert.notEqual(
    a,
    orderIdempotencyKey("c1", "0555123456", [
      { variant_id: "v1", quantity: 1 },
      { variant_id: "v2", quantity: 2 },
    ], new Date("2026-10-05T10:00:00Z")),
  );
});
