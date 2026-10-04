import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AllProvidersFailed,
  CircuitBreaker,
  providerFromEnv,
  runWithFallback,
  type ProviderConfig,
  type RunLimits,
} from "./providers.ts";

const mk = (name: string): ProviderConfig => ({
  name, baseUrl: `https://${name}/v1`, apiKey: `key-${name}`, model: "m", tokenParam: "max_tokens",
});
const primary = mk("friend.example");
const fallback = mk("api.openai.com");

function harness(behaviour: Record<string, () => string>) {
  const calls: { name: string; limits: RunLimits }[] = [];
  const run = async (p: ProviderConfig, limits: RunLimits) => {
    calls.push({ name: p.name, limits });
    return behaviour[p.name]();
  };
  return { calls, run };
}
const boom = (msg: string) => () => { throw new Error(msg); };

test("uses the primary when it works and never touches the fallback", async () => {
  const h = harness({ "friend.example": () => "from-primary", "api.openai.com": () => "from-fallback" });
  const r = await runWithFallback({ providers: [primary, fallback], run: h.run, breaker: new CircuitBreaker() });
  assert.equal(r.result, "from-primary");
  assert.deepEqual(h.calls.map((c) => c.name), ["friend.example"]);
  assert.deepEqual(r.attempts, []);
});

test("falls back when the primary errors, and records why", async () => {
  const h = harness({ "friend.example": boom("LLM request failed (503): down"), "api.openai.com": () => "from-fallback" });
  const r = await runWithFallback({ providers: [primary, fallback], run: h.run, breaker: new CircuitBreaker() });
  assert.equal(r.result, "from-fallback");
  assert.equal(r.provider.name, "api.openai.com");
  assert.deepEqual(r.attempts, [{ provider: "friend.example", error: "LLM request failed (503): down" }]);
});

test("throws with every attempt when all providers fail, without leaking keys", async () => {
  const h = harness({ "friend.example": boom("a"), "api.openai.com": boom("b") });
  await assert.rejects(
    runWithFallback({ providers: [primary, fallback], run: h.run, breaker: new CircuitBreaker() }),
    (e: unknown) => {
      assert.ok(e instanceof AllProvidersFailed);
      assert.equal(e.attempts.length, 2);
      assert.ok(!e.message.includes("key-"));
      return true;
    },
  );
});

test("a provider with a fallback gets a short leash; the last one gets patience", async () => {
  const h = harness({ "friend.example": boom("x"), "api.openai.com": () => "ok" });
  await runWithFallback({ providers: [primary, fallback], run: h.run, breaker: new CircuitBreaker() });
  assert.deepEqual(h.calls[0].limits, { timeoutMs: 20_000, maxAttempts: 1 });
  assert.deepEqual(h.calls[1].limits, { timeoutMs: 45_000, maxAttempts: 2 });

  const solo = harness({ "api.openai.com": () => "ok" });
  await runWithFallback({ providers: [fallback], run: solo.run, breaker: new CircuitBreaker() });
  assert.deepEqual(solo.calls[0].limits, { timeoutMs: 45_000, maxAttempts: 2 });
});

test("circuit breaker skips a failing primary, then retries it after the cooldown", async () => {
  let t = 1_000;
  const breaker = new CircuitBreaker(3, 60_000);
  const h = harness({ "friend.example": boom("down"), "api.openai.com": () => "ok" });
  const go = () => runWithFallback({ providers: [primary, fallback], run: h.run, breaker, now: () => t });

  for (let i = 0; i < 3; i++) await go(); // three failures open the circuit
  h.calls.length = 0;

  const skipped = await go();
  assert.deepEqual(h.calls.map((c) => c.name), ["api.openai.com"]); // primary not even called
  assert.equal(skipped.attempts[0].error, "skipped (recent failures)");

  t += 61_000; // cooldown over
  h.calls.length = 0;
  await go();
  assert.deepEqual(h.calls.map((c) => c.name), ["friend.example", "api.openai.com"]);
});

test("a success closes the circuit again", async () => {
  const breaker = new CircuitBreaker(2, 60_000);
  breaker.recordFailure("p", 0);
  breaker.recordSuccess("p");
  breaker.recordFailure("p", 0);
  assert.equal(breaker.isOpen("p", 1), false); // count restarted from zero
});

test("the last provider is never skipped, even with an open circuit", async () => {
  const breaker = new CircuitBreaker(1, 60_000);
  breaker.recordFailure("api.openai.com", 0);
  assert.equal(breaker.isOpen("api.openai.com", 1), true);
  const h = harness({ "api.openai.com": () => "ok" });
  const r = await runWithFallback({ providers: [fallback], run: h.run, breaker, now: () => 1 });
  assert.equal(r.result, "ok");
});

test("providerFromEnv: requires url, key and model; parses options per prefix", () => {
  const env = (m: Record<string, string>) => (k: string) => m[k];
  assert.equal(providerFromEnv(env({ LLM_BASE_URL: "https://x/v1", LLM_API_KEY: "k" }), "LLM_"), null);
  assert.equal(providerFromEnv(env({}), "LLM_FALLBACK_"), null);

  const p = providerFromEnv(env({
    LLM_BASE_URL: "https://codex-everywhere.com/v1", LLM_API_KEY: "k", LLM_MODEL: "gpt-6-luna",
    LLM_TOKEN_PARAM: "max_completion_tokens", LLM_REASONING_EFFORT: "none", LLM_TEMPERATURE: "0.3",
  }), "LLM_")!;
  assert.equal(p.name, "codex-everywhere.com");
  assert.equal(p.tokenParam, "max_completion_tokens");
  assert.equal(p.reasoningEffort, "none");
  assert.equal(p.temperature, 0.3);

  const f = providerFromEnv(env({
    LLM_FALLBACK_BASE_URL: "https://api.openai.com/v1", LLM_FALLBACK_API_KEY: "k2", LLM_FALLBACK_MODEL: "gpt-6-luna",
  }), "LLM_FALLBACK_")!;
  assert.equal(f.name, "api.openai.com");
  assert.equal(f.tokenParam, "max_tokens");
  assert.equal(f.reasoningEffort, undefined);
  assert.equal(f.temperature, undefined);
});
