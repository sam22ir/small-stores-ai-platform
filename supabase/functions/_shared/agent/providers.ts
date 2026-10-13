import { errorText } from "./tools.ts";

// An ordered list of OpenAI-compatible model providers: the first is the primary, the rest
// are fallbacks. A provider that errors is skipped for the current message; one that keeps
// failing is skipped entirely for a short cooldown so customers don't wait on a dead endpoint.

export interface ProviderConfig {
  name: string; // host name, safe to log (never contains the key)
  baseUrl: string;
  apiKey: string;
  model: string;
  tokenParam: "max_tokens" | "max_completion_tokens";
  reasoningEffort?: string;
  temperature?: number;
  // The model accepts photos (`${prefix}VISION=true`). Off by default: a text-only model rejects images.
  vision: boolean;
}

type Env = (key: string) => string | undefined;

// Reads LLM_* (primary) or LLM_FALLBACK_* settings. Returns null unless URL, key and model
// are all present, so "no fallback configured" is simply an absent provider.
export function providerFromEnv(
  get: Env,
  prefix: "LLM_" | "LLM_FALLBACK_",
): ProviderConfig | null {
  const baseUrl = get(`${prefix}BASE_URL`);
  const apiKey = get(`${prefix}API_KEY`);
  const model = get(`${prefix}MODEL`);
  if (!baseUrl || !apiKey || !model) return null;

  let name = baseUrl;
  try {
    name = new URL(baseUrl).host;
  } catch { /* keep the raw value; it is only used as a label */ }

  const temp = get(`${prefix}TEMPERATURE`);
  return {
    name,
    baseUrl,
    apiKey,
    model,
    tokenParam: get(`${prefix}TOKEN_PARAM`) === "max_completion_tokens"
      ? "max_completion_tokens"
      : "max_tokens",
    reasoningEffort: get(`${prefix}REASONING_EFFORT`) || undefined,
    temperature: temp ? Number(temp) : undefined,
    vision: get(`${prefix}VISION`) === "true",
  };
}

export class CircuitBreaker {
  private state = new Map<string, { failures: number; openUntil: number }>();
  private threshold: number;
  private cooldownMs: number;

  constructor(threshold = 3, cooldownMs = 60_000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  isOpen(name: string, now: number): boolean {
    const s = this.state.get(name);
    return !!s && s.openUntil > now;
  }

  recordSuccess(name: string): void {
    this.state.delete(name);
  }

  recordFailure(name: string, now: number): void {
    const s = this.state.get(name) ?? { failures: 0, openUntil: 0 };
    s.failures += 1;
    // After the threshold, open the circuit; one more failure after the cooldown re-opens it.
    if (s.failures >= this.threshold) s.openUntil = now + this.cooldownMs;
    this.state.set(name, s);
  }
}

export interface AttemptError {
  provider: string;
  error: string;
}

export class AllProvidersFailed extends Error {
  attempts: AttemptError[];

  constructor(attempts: AttemptError[]) {
    super(
      `All model providers failed: ${
        attempts.map((a) => `${a.provider}: ${a.error}`).join(" | ")
      }`,
    );
    this.attempts = attempts;
  }
}

export interface RunLimits {
  timeoutMs: number;
  maxAttempts: number;
}

// A provider with a fallback behind it gets a short leash (one attempt, short timeout);
// the last provider gets the patient settings.
const PRIMARY_LIMITS: RunLimits = { timeoutMs: 20_000, maxAttempts: 1 };
const LAST_LIMITS: RunLimits = { timeoutMs: 45_000, maxAttempts: 2 };

export async function runWithFallback<T>(opts: {
  providers: ProviderConfig[];
  run: (provider: ProviderConfig, limits: RunLimits) => Promise<T>;
  breaker: CircuitBreaker;
  now?: () => number;
}): Promise<{ result: T; provider: ProviderConfig; attempts: AttemptError[] }> {
  const { providers, run, breaker } = opts;
  const now = opts.now ?? Date.now;
  const attempts: AttemptError[] = [];

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const isLast = i === providers.length - 1;

    // Never skip the last provider: with nothing left to try, a retry beats silence.
    if (!isLast && breaker.isOpen(provider.name, now())) {
      attempts.push({ provider: provider.name, error: "skipped (recent failures)" });
      continue;
    }

    try {
      const result = await run(provider, isLast ? LAST_LIMITS : PRIMARY_LIMITS);
      breaker.recordSuccess(provider.name);
      return { result, provider, attempts };
    } catch (err) {
      breaker.recordFailure(provider.name, now());
      attempts.push({ provider: provider.name, error: errorText(err) });
    }
  }
  throw new AllProvidersFailed(attempts);
}
