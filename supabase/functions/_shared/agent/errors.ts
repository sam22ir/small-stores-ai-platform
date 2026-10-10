import { AllProvidersFailed } from "./providers.ts";

// A short, stable label for a failed model run, for structured logs and agent_runs.
// Never includes the error message: provider messages can echo request details.
export function errorKind(err: unknown): string {
  if (err instanceof AllProvidersFailed) return "all_providers_failed";
  const status = (err as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    if (status === 429) return "rate_limited";
    if (status >= 500) return "upstream_5xx";
    if (status >= 400) return "upstream_4xx";
  }
  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timeout";
  return "unknown";
}
