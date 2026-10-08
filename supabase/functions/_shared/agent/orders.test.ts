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
  const items = [
    { variant_id: "v1", quantity: 1 },
    { variant_id: "v2", quantity: 2 },
  ];
  const a = orderIdempotencyKey("c1", "0555123456", "Alger", "12 rue X", items, day);
  assert.equal(
    a,
    orderIdempotencyKey("c1", "0555123456", "Alger", "12 rue X", [...items].reverse(), day),
  );
  assert.notEqual(
    a,
    orderIdempotencyKey("c1", "0555123456", "Alger", "12 rue X", [{ variant_id: "v1", quantity: 2 }], day),
  );
  assert.notEqual(
    a,
    orderIdempotencyKey("c2", "0555123456", "Alger", "12 rue X", items, day),
  );
  assert.notEqual(
    a,
    orderIdempotencyKey("c1", "0555123456", "Alger", "12 rue X", items, new Date("2026-10-05T10:00:00Z")),
  );
});

test("a second order of the same items to another address is a different key", () => {
  const day = new Date("2026-10-04T10:00:00Z");
  const items = [{ variant_id: "v1", quantity: 1 }];
  const a = orderIdempotencyKey("c1", "0555123456", "Alger", "12 rue X", items, day);
  assert.notEqual(a, orderIdempotencyKey("c1", "0555123456", "Alger", "5 rue Y", items, day));
  assert.notEqual(a, orderIdempotencyKey("c1", "0555123456", "Oran", "12 rue X", items, day));
});

test("address and wilaya differing only in case or whitespace give the same key", () => {
  const day = new Date("2026-10-04T10:00:00Z");
  const items = [{ variant_id: "v1", quantity: 1 }];
  const a = orderIdempotencyKey("c1", "0555123456", "Alger", "12 Rue  des Lilas", items, day);
  assert.equal(
    a,
    orderIdempotencyKey("c1", "0555123456", "  alger ", " 12 rue des   lilas ", items, day),
  );
});

test("the day rolls over at local midnight (Africa/Algiers, UTC+1)", () => {
  const items = [{ variant_id: "v1", quantity: 1 }];
  const args = ["c1", "0555123456", "Alger", "12 rue X", items] as const;
  // 23:30 UTC is 00:30 next day in Algiers, so it must not share a key with 22:30 UTC the same day.
  const before = orderIdempotencyKey(...args, new Date("2026-10-04T22:30:00Z"));
  const late = orderIdempotencyKey(...args, new Date("2026-10-04T23:30:00Z"));
  const nextMorning = orderIdempotencyKey(...args, new Date("2026-10-05T08:00:00Z"));
  assert.notEqual(before, late);
  assert.equal(late, nextMorning);
});
