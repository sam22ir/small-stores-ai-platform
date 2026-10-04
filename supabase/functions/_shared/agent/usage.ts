// Monthly reply allowance per store. Only agent replies to customers count: dashboard test
// chats, dev runs and fast-path greetings are free.

export const DEFAULT_MONTHLY_REPLY_LIMIT = 1000;

// Calendar month in UTC; the counter resets on the 1st at 00:00 UTC.
export function monthStartUtc(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export interface UsageStatus {
  used: number;
  limit: number;
  remaining: number;
  exceeded: boolean;
  nearLimit: boolean; // 80% or more used
}

export function usageStatus(used: number, limit: number): UsageStatus {
  const safeLimit = Math.max(0, limit);
  return {
    used,
    limit: safeLimit,
    remaining: Math.max(0, safeLimit - used),
    exceeded: used >= safeLimit,
    nearLimit: safeLimit > 0 && used >= safeLimit * 0.8,
  };
}
