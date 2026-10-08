import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemPrompt } from "./prompt.ts";
import type { StoreContext } from "./types.ts";

const store = { name: "Demo Boutique", orders_enabled: true } as unknown as StoreContext;

test("prompt states the Latin-script Darija rule with an example", () => {
  const p = buildSystemPrompt(store);
  assert.match(p, /Algerian Darija written in Latin letters \(arabizi\) gets Latin-letter Darija, never French/);
  assert.match(p, /never Arabic script/);
  assert.match(p, /b9addeh hoodie noir\? kayen taille M\?/);
  assert.match(p, /keep it for the whole conversation/);
});

test("prompt adds a per-turn language hint when the language is known", () => {
  assert.match(buildSystemPrompt(store, "dz"), /Language for this reply: Algerian Darija in Latin letters/);
  assert.match(buildSystemPrompt(store, "ar"), /Language for this reply: Arabic script/);
  assert.doesNotMatch(buildSystemPrompt(store), /Language for this reply/);
});
