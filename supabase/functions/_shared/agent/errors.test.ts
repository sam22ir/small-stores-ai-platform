import assert from "node:assert/strict";
import { test } from "node:test";
import { errorKind } from "./errors.ts";
import { AllProvidersFailed } from "./providers.ts";

test("error kinds are short labels, not messages", () => {
  assert.equal(errorKind(Object.assign(new Error("secret body"), { status: 429 })), "rate_limited");
  assert.equal(errorKind(Object.assign(new Error("x"), { status: 503 })), "upstream_5xx");
  assert.equal(errorKind(Object.assign(new Error("x"), { status: 400 })), "upstream_4xx");
  assert.equal(errorKind(Object.assign(new Error("x"), { name: "TimeoutError" })), "timeout");
  assert.equal(errorKind(new AllProvidersFailed([])), "all_providers_failed");
  assert.equal(errorKind("boom"), "unknown");
  assert.equal(errorKind(null), "unknown");
});
