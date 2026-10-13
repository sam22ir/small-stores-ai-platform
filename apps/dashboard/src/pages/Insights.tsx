import { useEffect, useState } from "react";
import { m } from "motion/react";
import { Alert, Button } from "@heroui/react";
import { supabase } from "../lib/supabase";
import { useI18n } from "../lib/i18n";
import type { TKey } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import { useStore } from "../lib/store";
import { formatMoney } from "../lib/format";
import {
  barHeights, handoffRate, isEmptyInsights, parseInsights,
  type BarKey, type InsightsDay, type InsightsResult,
} from "../lib/insights";
import { dur, ease, useMotionSafe } from "../lib/motion";

const RANGES = [7, 30] as const;
type Range = (typeof RANGES)[number];

// Arabic text with Latin digits, the same convention as format.ts.
const LOCALES: Record<Lang, string> = { en: "en", fr: "fr", ar: "ar-u-nu-latn" };

function formatDay(day: string, lang: Lang): string {
  const d = new Date(`${day}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return day;
  return new Intl.DateTimeFormat(LOCALES[lang], { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
}

function Stat({ testId, label, value }: { testId: string; label: string; value: string }) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm">
      <span className="text-xs font-semibold text-soft">{label}</span>
      <span className="text-2xl font-extrabold tabular-nums text-ink">{value}</span>
    </div>
  );
}

// Hand-built bars (no chart library). Every bar shows its count, the busiest value is named on the scale line,
// days without activity keep a thin tick so the time axis stays readable, and each column has a hover title.
// The chart is decorative for sighted users; the sr-only table and the aria-label carry the same numbers for
// screen readers. The chart stays LTR so time runs left to right.
// Pixel heights: percentages collapse inside a flex column. The chart is h-40 (160px); the top 20px hold the count above the tallest bar.
const BAR_AREA = 140;

function BarChart({ title, label, days, dataKey, fill, lang, dayHeader }: {
  title: string;
  label: string;
  days: InsightsDay[];
  dataKey: BarKey;
  fill: string;
  lang: Lang;
  dayHeader: string;
}) {
  const reduced = useMotionSafe();
  const heights = barHeights(days, dataKey);
  const numberFmt = new Intl.NumberFormat(LOCALES[lang]);
  const peak = Math.max(0, ...days.map((d) => Number(d[dataKey]) || 0));
  // With many days the counts above the bars would collide, so they are shown for short ranges only.
  const showCounts = days.length <= 14;
  // Date labels: every day for a week, otherwise about one in five plus the last day.
  const labelEvery = days.length <= 7 ? 1 : 5;
  const showDate = (i: number) => i % labelEvery === 0 || i === days.length - 1;
  return (
    <figure className="m-0 flex flex-col gap-2 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm">
      <figcaption className="flex items-baseline justify-between gap-2 text-sm font-bold text-ink">
        <span>{title}</span>
        <span className="text-xs font-semibold tabular-nums text-soft" aria-hidden="true">{numberFmt.format(peak)}</span>
      </figcaption>
      <div role="img" aria-label={label} dir="ltr" className="relative flex h-40 w-full items-stretch gap-1 border-b-2 border-ink/30">
        {/* The top line is the busiest day's value, so bar heights can be read against it. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-5 border-t border-dashed border-ink/15" />
        {heights.map((h, i) => {
          const value = Number(days[i][dataKey]) || 0;
          const tip = `${formatDay(days[i].day, lang)}: ${numberFmt.format(value)}`;
          return (
            <div key={days[i].day} title={tip} className="flex min-w-0 flex-1 flex-col items-center justify-end">
              {showCounts && (
                <span aria-hidden="true" className="mb-0.5 text-[11px] font-bold tabular-nums leading-none text-ink">{value > 0 ? numberFmt.format(value) : ""}</span>
              )}
              {value > 0 ? (
                <m.div
                  className={`w-full max-w-10 rounded-t-md ${fill}`}
                  style={{ height: Math.max(Math.round(h * BAR_AREA), 4), transformOrigin: "50% 100%" }}
                  initial={reduced ? false : { scaleY: 0 }}
                  animate={{ scaleY: 1 }}
                  transition={{ duration: dur.base, ease: ease.out }}
                />
              ) : (
                <div className="h-0.5 w-full max-w-10 rounded-full bg-ink/20" />
              )}
            </div>
          );
        })}
      </div>
      {days.length > 0 && (
        <div dir="ltr" className="flex gap-1 text-[10px] leading-tight text-soft" aria-hidden="true">
          {days.map((d, i) => (
            <span key={d.day} className="min-w-0 flex-1 whitespace-nowrap text-center">{showDate(i) ? formatDay(d.day, lang) : ""}</span>
          ))}
        </div>
      )}
      <table className="sr-only">
        <caption>{title}</caption>
        <thead>
          <tr><th scope="col">{dayHeader}</th><th scope="col">{title}</th></tr>
        </thead>
        <tbody>
          {days.map((d) => (
            <tr key={d.day}><td>{formatDay(d.day, lang)}</td><td>{d[dataKey]}</td></tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

export function Insights() {
  const { t, lang } = useI18n();
  const reduced = useMotionSafe();
  const { store } = useStore();
  const storeId = store!.id;
  const currency = store!.currency;
  const [range, setRange] = useState<Range>(7);
  const [data, setData] = useState<InsightsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // A late response for an earlier range must not overwrite the one the owner picked last.
  useEffect(() => {
    let stale = false;
    setLoading(true);
    supabase.rpc("store_insights", { p_store_id: storeId, p_days: range }).then(({ data: raw, error }) => {
      if (stale) return;
      if (error) { setFailed(true); setData(null); setLoading(false); return; }
      setData(parseInsights(raw));
      setFailed(false);
      setLoading(false);
    });
    return () => { stale = true; };
  }, [storeId, range, attempt]);

  const nf = new Intl.NumberFormat(LOCALES[lang]);
  const totals = data?.totals;
  const empty = !!totals && isEmptyInsights(totals);
  const busy = loading && data !== null;

  return (
    <m.div
      initial={reduced ? false : { opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: dur.base, ease: ease.out }}
    >
      <h1 className="mb-4 mt-1 text-[22px] font-extrabold text-ink">{t("insights.title")}</h1>
      <div role="tablist" aria-label={t("insights.range")} className="mb-4 flex flex-wrap gap-2">
        {RANGES.map((r) => {
          const key: TKey = r === 7 ? "insights.range7" : "insights.range30";
          return (
            <button
              key={r}
              role="tab"
              aria-selected={range === r}
              onClick={() => setRange(r)}
              className={`min-h-10 rounded-full border-2 px-3.5 text-sm font-bold transition-colors ${range === r ? "border-ink bg-ink text-slip" : "border-ink/20 bg-slip text-ink hover:border-ink"}`}
            >
              {t(key)}
            </button>
          );
        })}
      </div>

      {failed && (
        <Alert status="danger" className="mb-3">
          <Alert.Content>
            <Alert.Description>{t("common.error")} <Button size="sm" variant="outline" onPress={() => setAttempt((n) => n + 1)}>{t("common.retry")}</Button></Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!data && !failed && (
        <>
          <p role="status" className="mb-3 text-soft">{t("common.loading")}</p>
          <div aria-hidden="true" className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="h-20 animate-pulse rounded-wakil-lg border-2 border-ink/20 bg-ink/5" />
            ))}
          </div>
        </>
      )}

      {data && totals && (
        <div className={`flex flex-col gap-4 transition-opacity duration-150 ${busy ? "opacity-60" : ""}`} aria-busy={busy}>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
            <Stat testId="insights-stat-conversations" label={t("insights.statConversations")} value={nf.format(totals.conversations)} />
            <Stat testId="insights-stat-replies" label={t("insights.statReplies")} value={nf.format(totals.replies)} />
            <Stat testId="insights-stat-handoff" label={t("insights.statHandoff")} value={new Intl.NumberFormat(LOCALES[lang], { style: "percent", maximumFractionDigits: 0 }).format(handoffRate(totals))} />
            <Stat testId="insights-stat-orders" label={t("insights.statOrders")} value={nf.format(totals.orders)} />
            <Stat testId="insights-stat-revenue" label={t("insights.statRevenue")} value={formatMoney(totals.revenue_cents, currency, lang)} />
            <Stat testId="insights-stat-credits" label={t("insights.statCredits")} value={nf.format(data.reply_credits)} />
          </div>
          <p className="text-sm text-soft">{t("insights.note")}</p>

          {empty ? (
            <p data-testid="insights-empty" className="rounded-wakil-lg border-2 border-ink bg-slip p-8 text-center text-soft">{t("insights.empty")}</p>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              <BarChart
                title={t("insights.chartConversations")}
                label={t("insights.chartLabel", { name: t("insights.chartConversations"), total: nf.format(totals.conversations), days: range })}
                days={data.days}
                dataKey="conversations"
                fill="bg-blue"
                lang={lang}
                dayHeader={t("insights.day")}
              />
              <BarChart
                title={t("insights.chartOrders")}
                label={t("insights.chartLabel", { name: t("insights.chartOrders"), total: nf.format(totals.orders), days: range })}
                days={data.days}
                dataKey="orders"
                fill="bg-ink"
                lang={lang}
                dayHeader={t("insights.day")}
              />
            </div>
          )}

          <section className="rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm">
            <h2 className="mb-2 text-sm font-bold text-ink">{t("insights.topProducts")}</h2>
            {data.top_products.length === 0 ? (
              <p className="text-sm text-soft">{t("insights.noProducts")}</p>
            ) : (
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0 text-sm">
                {data.top_products.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex justify-between gap-3">
                    <span className="min-w-0 truncate">{p.name}</span>
                    <span className="shrink-0 font-bold tabular-nums">{nf.format(p.quantity)}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}
    </m.div>
  );
}
