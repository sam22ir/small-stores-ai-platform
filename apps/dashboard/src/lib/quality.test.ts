import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "../../../../scripts/stress/build-quality-data.mjs";
import { QUALITY_DATA } from "./qualityData.generated.ts";
import landingEn from "./locales/quality/en.ts";
import landingFr from "./locales/quality/fr.ts";
import landingAr from "./locales/quality/ar.ts";

test("generated quality data matches the verdict files (no hand edits)", () => {
  const onDisk = readFileSync(new URL("./qualityData.generated.ts", import.meta.url), "utf8");
  assert.equal(onDisk, build());
});

test("each full round adds up", () => {
  for (const r of QUALITY_DATA.rounds) {
    if (r.kind !== "full") continue;
    const x = r as unknown as { pass: number; notPassed: number; categories: Record<string, { pass: number; total: number }> };
    assert.equal(x.pass + x.notPassed, QUALITY_DATA.total);
    const sum = Object.values(x.categories).reduce((a, c) => a + c.total, 0);
    assert.equal(sum, QUALITY_DATA.total);
    assert.equal(Object.values(x.categories).reduce((a, c) => a + c.pass, 0), x.pass);
  }
});

test("every key the page can show exists in every language", () => {
  for (const [name, d] of [["en", landingEn], ["fr", landingFr], ["ar", landingAr]] as const) {
    for (const r of QUALITY_DATA.rounds) {
      assert.ok(d.roundNames[r.id], `${name}: round name ${r.id}`);
      for (const f of r.fixes) assert.ok(d.changes.items[f], `${name}: fix ${f}`);
      if (r.kind === "full") assert.ok(d.judge[(r as unknown as { judge: string }).judge], `${name}: judge`);
    }
    for (const c of QUALITY_DATA.categories) assert.ok(d.categories.names[c], `${name}: category ${c}`);
    for (const k of QUALITY_DATA.open) assert.ok(d.open.items[k], `${name}: open ${k}`);
  }
});
