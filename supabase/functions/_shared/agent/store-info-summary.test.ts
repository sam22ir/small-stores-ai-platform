import { test } from "node:test";
import assert from "node:assert/strict";
import { deliveryFeeSummary } from "./tools/store-info.ts";
import { WILAYA_CODES, wilayaName } from "./wilaya.ts";

test("a store that lists all 58 wilayas gets one 'for all other wilayas' line for its most common fee", () => {
  const rows = WILAYA_CODES.map((code) => ({
    wilaya: wilayaName(Number(code)) ?? code,
    fee_cents: 120000,
  }));
  rows[0] = { wilaya: rows[0].wilaya, fee_cents: 40000 }; // Adrar
  rows[15] = { wilaya: rows[15].wilaya, fee_cents: 60000 }; // Alger's neighbour, one exception
  rows[30] = { wilaya: rows[30].wilaya, fee_cents: 70000 }; // Oran
  const s = deliveryFeeSummary(rows, "DZD") as { lines: string[] };
  assert.equal(s.lines.length, 4);
  assert.match(s.lines[s.lines.length - 1], /for all other wilayas$/);
  assert.match(s.lines[s.lines.length - 1], /1,200/);
  assert.ok(s.lines.some((l) => /Oran/.test(l) && /700/.test(l)));
  assert.ok(!s.lines.some((l) => /Tamanrasset/.test(l)), "no per-wilaya row for the common fee");
});

test("a partial list names every wilaya and never claims that unlisted ones are served", () => {
  const s = deliveryFeeSummary(
    [
      { wilaya: "Oran", fee_cents: 70000 },
      { wilaya: "Sétif", fee_cents: 60000 },
      { wilaya: "Alger", fee_cents: 60000 },
    ],
    "DZD",
  ) as { lines: string[]; note: string };
  assert.equal(s.lines.length, 2);
  assert.ok(s.lines.some((l) => /Sétif, Alger/.test(l)));
  assert.ok(s.lines.some((l) => /Oran/.test(l)));
  assert.ok(!s.lines.some((l) => /all other/.test(l)));
  assert.match(s.note, /Wilayas not listed are not served/);
});

test("no fees set: the summary says so and does not invent a number", () => {
  const s = deliveryFeeSummary([], "DZD") as { lines: string[]; note: string };
  assert.deepEqual(s.lines, []);
  assert.match(s.note, /don't invent a number/);
});
