// Pure helpers for the Insights page. Shapes match the store_insights RPC (supabase/migrations/0024_dashboard_rpcs.sql).
// No imports on purpose: the unit tests run under plain `node --test`.

export type InsightsDay = {
  day: string; // YYYY-MM-DD (UTC)
  conversations: number;
  replies: number;
  handoffs: number;
  orders: number;
  revenue_cents: number;
};
export type InsightsTotals = Omit<InsightsDay, "day">;
export type InsightsResult = {
  days: InsightsDay[];
  totals: InsightsTotals;
  top_products: { name: string; quantity: number }[];
  reply_credits: number;
};
export type BarKey = "conversations" | "orders";

// Anything missing or not a finite positive number counts as zero.
const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

export const EMPTY_TOTALS: InsightsTotals = { conversations: 0, replies: 0, handoffs: 0, orders: 0, revenue_cents: 0 };

// Turns whatever the RPC returned into a fully populated result, so the page never handles undefined fields.
export function parseInsights(raw: unknown): InsightsResult {
  const r = obj(raw);
  const days: InsightsDay[] = Array.isArray(r.days)
    ? r.days.map((d) => {
        const x = obj(d);
        return {
          day: typeof x.day === "string" ? x.day : "",
          conversations: count(x.conversations),
          replies: count(x.replies),
          handoffs: count(x.handoffs),
          orders: count(x.orders),
          revenue_cents: count(x.revenue_cents),
        };
      })
    : [];
  const t = obj(r.totals);
  const totals: InsightsTotals = {
    conversations: count(t.conversations),
    replies: count(t.replies),
    handoffs: count(t.handoffs),
    orders: count(t.orders),
    revenue_cents: count(t.revenue_cents),
  };
  const top_products = Array.isArray(r.top_products)
    ? r.top_products.map((p) => {
        const x = obj(p);
        return { name: typeof x.name === "string" ? x.name : "", quantity: count(x.quantity) };
      })
    : [];
  return { days, totals, top_products, reply_credits: count(r.reply_credits) };
}

// Share of conversations that were handed to the owner, 0..1. Handoffs and conversations are counted
// on different dates, so the raw ratio can exceed 1; it is clamped.
export function handoffRate(totals: Pick<InsightsTotals, "conversations" | "handoffs">): number {
  const conversations = count(totals.conversations);
  if (conversations === 0) return 0;
  return Math.min(1, Math.max(0, count(totals.handoffs) / conversations));
}

// True when nothing happened in the window (drives the empty state).
export function isEmptyInsights(totals: InsightsTotals): boolean {
  return Object.values(totals).every((v) => count(v) === 0);
}

// Bar heights scaled to the busiest day, each in 0..1. All-zero series give all zeros (no division by zero).
export function barHeights(series: InsightsDay[], key: BarKey): number[] {
  const values = series.map((d) => count(d[key]));
  const max = Math.max(0, ...values);
  if (max === 0) return values.map(() => 0);
  return values.map((v) => v / max);
}
