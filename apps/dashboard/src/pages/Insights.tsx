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

// Hand-built SVG bars (no chart library). The chart is decorative for sighted users; the sr-only table and
// the aria-label carry the same numbers for screen readers. The chart stays LTR so time runs left to right.
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
  const width = Math.max(days.length, 1) * 10;
  const first = days[0];
  const last = days[days.length - 1];
  return (
    <figure className="m-0 flex flex-col gap-2 rounded-wakil-lg border-2 border-ink bg-slip p-4 shadow-ink-sm">
      <figcaption className="text-sm font-bold text-ink">{title}</figcaption>
      <div dir="ltr" className="h-36 w-full">
        <svg role="img" aria-label={label} viewBox={`0 0 ${width} 100`} preserveAspectRatio="none" className="h-full w-full" focusable="false">
          {heights.map((h, i) => (
            <m.rect
              key={days[i].day}
              x={i * 10 + 2}
              y={100 - h * 100}
              width={6}
              height={h * 100}
              className={fill}
              initial={reduced ? false : { scaleY: 0 }}
              animate={{ scaleY: 1 }}
              style={{ transformOrigin: "50% 100%", transformBox: "fill-box" }}
              transition={{ duration: dur.base, ease: ease.out }}
            />
          ))}
        </svg>
      </div>
      {first && last && (
        <div dir="ltr" className="flex justify-between text-xs text-soft" aria-hidden="true">
          <span>{formatDay(first.day, lang)}</span>
          <span>{formatDay(last.day, lang)}</span>
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
      if (error) { setFailed(true); setLoading(false); return; }
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
                fill="fill-blue"
                lang={lang}
                dayHeader={t("insights.day")}
              />
              <BarChart
                title={t("insights.chartOrders")}
                label={t("insights.chartLabel", { name: t("insights.chartOrders"), total: nf.format(totals.orders), days: range })}
                days={data.days}
                dataKey="orders"
                fill="fill-ink"
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
