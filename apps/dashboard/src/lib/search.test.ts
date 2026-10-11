import assert from "node:assert/strict";
import { test } from "node:test";
import { ilikeOr } from "./search.ts";

test("plain text becomes a contains match on each column", () => {
  assert.equal(ilikeOr(["customer_name", "phone"], "Lina"), 'customer_name.ilike."*Lina*",phone.ilike."*Lina*"');
});

test("LIKE wildcards are escaped so they match literally", () => {
  // Text 50%_ -> LIKE 50\%\_ -> quoted with each backslash doubled.
  assert.equal(ilikeOr(["phone"], "50%_"), 'phone.ilike."*50\\\\%\\\\_*"');
});

test("commas, parentheses and quotes cannot break out of the value", () => {
  assert.equal(ilikeOr(["customer_name"], 'a,b(c)"d'), 'customer_name.ilike."*a,b(c)\\"d*"');
});

test("asterisks are dropped and backslashes are escaped inside the quotes", () => {
  // Text *x\y -> x\y -> LIKE x\\y -> quoted x\\\\y.
  assert.equal(ilikeOr(["phone"], "*x\\y"), 'phone.ilike."*x\\\\\\\\y*"');
});

test("Arabic text passes through unchanged", () => {
  assert.equal(ilikeOr(["customer_name"], "هودي"), 'customer_name.ilike."*هودي*"');
});
