import { use, useEffect } from "react";
import type { ReactNode } from "react";
import { Card } from "@heroui/react";
import { applyDocumentLang, useI18n } from "../lib/i18n";
import type { Lang } from "../lib/i18n";
import type { QualityDict } from "../lib/locales/quality/types";
import { QUALITY_DATA } from "../lib/qualityData.generated";
import { Logo } from "../components/wakil/Logo";
import { Reveal } from "../components/wakil/Reveal";
import { CountUp } from "../components/wakil/CountUp";
import { RouteButton, RouteLink } from "../components/wakil/RouteLink";
import { QUALITY_PATHS, setLink, setMeta } from "./landing/useLandingHead";

const LOCALES: Lang[] = ["ar", "fr", "en"];
const HOME_PATHS: Record<Lang, string> = { ar: "/", fr: "/fr", en: "/en" };
const LANG_NAMES: Record<Lang, string> = { ar: "العربية", fr: "Français", en: "English" };

const loaders: Record<Lang, () => Promise<{ default: QualityDict }>> = {
  ar: () => import("../lib/locales/quality/ar"),
  fr: () => import("../lib/locales/quality/fr"),
  en: () => import("../lib/locales/quality/en"),
};
const cache = new Map<Lang, Promise<QualityDict>>();
function loadQuality(lang: Lang): Promise<QualityDict> {
  let p = cache.get(lang);
  if (!p) { p = loaders[lang]().then((m) => m.default); cache.set(lang, p); }
  return p;
}

interface Counts { pass: number; total: number }
interface FullRound {
  id: string; date: string; kind: "full"; fixes: readonly string[]; judge: string;
  pass: number; notPassed: number; ruleViolation: number; specGap: number; critical: number; high: number;
  categories: Record<string, Counts>;
  reproducibility?: { total: number; three: number; two: number; one: number; testProblems: number };
  recheck?: { total: number; agree: number; firstPass: number; downgraded: number };
}
interface PartialRound { id: string; date: string; kind: "partial"; fixes: readonly string[] }
type Round = FullRound | PartialRound;

const rounds = QUALITY_DATA.rounds as unknown as Round[];
const fullRounds = rounds.filter((r): r is FullRound => r.kind === "full");
const first = fullRounds[0];
const latest = fullRounds[fullRounds.length - 1];
const total = QUALITY_DATA.total;

// 2026-10-16 -> 16/10/2026, Latin digits in every language.
function fmtDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
// Numbers like "449 / 500" and dates keep their left-to-right order inside right-to-left Arabic text.
const Ltr = ({ children }: { children: ReactNode }) => <bdi dir="ltr">{children}</bdi>;
const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.replace(`{${k}}`, String(v)), s);

function useQualityHead(locale: Lang, d: QualityDict) {
  const { lang: appLang } = useI18n();
  useEffect(() => {
    const origin = window.location.origin;
    const prevTitle = document.title;
    document.title = d.title;
    document.documentElement.lang = d.htmlLang;
    document.documentElement.dir = d.dir;
    setMeta("name", "description", d.description);
    setMeta("property", "og:title", d.title);
    setMeta("property", "og:description", d.description);
    setMeta("property", "og:type", "website");
    setMeta("property", "og:locale", d.ogLocale);
    setMeta("property", "og:url", `${origin}${QUALITY_PATHS[locale]}`);
    setLink("canonical", `${origin}${QUALITY_PATHS[locale]}`);
    for (const l of LOCALES) setLink("alternate", `${origin}${QUALITY_PATHS[l]}`, l);
    setLink("alternate", `${origin}${QUALITY_PATHS.ar}`, "x-default");
    return () => {
      document.title = prevTitle;
      applyDocumentLang(appLang);
    };
  }, [locale]); // appLang is read once per visit.
}

function Section({ title, intro, children }: { title: string; intro?: string; children: ReactNode }) {
  return (
    <Reveal>
      <section className="mt-16">
        <h2 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h2>
        {intro && <p className="mt-2 max-w-3xl text-soft">{intro}</p>}
        <div className="mt-6">{children}</div>
      </section>
    </Reveal>
  );
}

function Bar({ value, max, tone }: { value: number; max: number; tone: "latest" | "older" }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
      <div className={`h-full rounded-full ${tone === "latest" ? "bg-blue" : "bg-soft/60"}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

function Header({ locale, d }: { locale: Lang; d: QualityDict }) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/90 py-3 backdrop-blur">
      <nav className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <RouteLink to={HOME_PATHS[locale]}><Logo /></RouteLink>
        <div className="flex items-center gap-2 sm:gap-3">
          <ul role="list" aria-label={d.nav.langLabel} className="flex items-center gap-1 rounded-full border border-ink/15 bg-slip p-1">
            {LOCALES.map((l) => (
              <li key={l}>
                <RouteLink to={QUALITY_PATHS[l]}>
                  <span
                    lang={l}
                    aria-current={l === locale ? "page" : undefined}
                    className={`block rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${l === locale ? "bg-ink text-slip" : "text-ink hover:text-blue"}`}
                  >
                    {LANG_NAMES[l]}
                  </span>
                </RouteLink>
              </li>
            ))}
          </ul>
          <RouteLink to="/login" className="hidden text-sm font-semibold text-ink sm:inline-flex">{d.nav.logIn}</RouteLink>
          <RouteButton to="/signup" variant="primary" size="sm" className="hidden whitespace-nowrap bg-red text-slip shadow-ink-sm sm:inline-flex">
            {d.nav.startFree}
          </RouteButton>
        </div>
      </nav>
    </header>
  );
}

function Quality({ locale, d }: { locale: Lang; d: QualityDict }) {
  useQualityHead(locale, d);
  const stat = (label: string, value: number, note?: string) => (
    <Card className="border border-ink/10 bg-slip p-4 shadow-ink-sm" key={label}>
      <p className="text-3xl font-bold text-ink"><CountUp to={value} viewOnce /></p>
      <p className="mt-1 text-sm font-semibold text-ink">{label}</p>
      {note && <p className="mt-1 text-xs text-soft">{note}</p>}
    </Card>
  );

  return (
    <div className="min-h-dvh bg-paper text-ink">
      <Header locale={locale} d={d} />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:px-6">
        <section>
          <p className="inline-block rounded-full border border-ink/15 bg-slip px-3 py-1 text-xs font-semibold text-blue">{d.hero.kicker}</p>
          <h1 className="mt-4 text-5xl font-bold text-ink sm:text-6xl">{d.hero.h1}</h1>
          <p className="mt-4 max-w-3xl text-lg text-soft">{d.hero.lede}</p>
          <div className="mt-8 rounded-wakil-lg border border-ink/10 bg-slip p-6 shadow-ink">
            <p className="text-sm font-semibold text-blue">{fill(d.hero.latest, { date: fmtDate(latest.date) })}</p>
            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-6xl font-bold text-ink"><CountUp to={latest.pass} viewOnce /></span>
              <span className="text-lg text-soft">{fill(d.hero.passedOf, { total })}</span>
            </p>
            <p className="mt-3 text-sm text-soft">{d.judge[latest.judge] ?? latest.judge}</p>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stat(d.stats.passed, latest.pass)}
            {stat(d.stats.notPassed, latest.notPassed)}
            {latest.reproducibility && stat(d.stats.repeatable, latest.reproducibility.three, d.stats.repeatableNote)}
            {latest.reproducibility && stat(d.stats.oneOff, latest.reproducibility.one)}
          </div>
        </section>

        {latest.reproducibility && latest.recheck && (
          <Reveal>
            <section className="mt-10 rounded-wakil border border-ink/10 bg-slip p-5">
              <h2 className="text-lg font-bold text-ink">{d.trust.heading}</h2>
              <ul className="mt-3 list-disc space-y-2 ps-5 text-sm text-ink">
                <li>{fill(d.trust.reruns, { failed: latest.notPassed, ...latest.reproducibility })}</li>
                <li>{fill(d.trust.recheck, latest.recheck)}</li>
                <li>{fill(d.trust.caution, { pass: latest.pass, total })}</li>
              </ul>
            </section>
          </Reveal>
        )}

        <Section title={d.rounds.heading} intro={d.rounds.intro}>
          <ul role="list" className="space-y-4">
            {fullRounds.map((r) => (
              <li key={r.id}>
                <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                  <span className="font-semibold text-ink">{d.roundNames[r.id] ?? r.id}</span>
                  <span className="text-soft"><Ltr>{r.pass} / {total}</Ltr></span>
                </div>
                <Bar value={r.pass} max={total} tone={r.id === latest.id ? "latest" : "older"} />
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-soft">{d.rounds.severityNote}</p>
          <div className="mt-3 overflow-x-auto rounded-wakil border border-ink/10 bg-slip">
            <table className="w-full min-w-[34rem] text-start text-sm">
              <caption className="sr-only">{d.rounds.tableLabel}</caption>
              <thead className="border-b border-ink/10 text-soft">
                <tr>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{d.rounds.round}</th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{d.rounds.date}</th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{d.rounds.passed}</th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{d.rounds.critical}</th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{d.rounds.high}</th>
                  <th scope="col" className="px-4 py-3 text-start font-semibold">{d.rounds.judging}</th>
                </tr>
              </thead>
              <tbody>
                {rounds.map((r) => (
                  <tr key={r.id} className="border-b border-ink/5 last:border-0 align-top">
                    <th scope="row" className="px-4 py-3 text-start font-semibold text-ink">{d.roundNames[r.id] ?? r.id}</th>
                    <td className="whitespace-nowrap px-4 py-3 text-soft"><Ltr>{fmtDate(r.date)}</Ltr></td>
                    {r.kind === "full" ? (
                      <>
                        <td className="whitespace-nowrap px-4 py-3 font-semibold text-ink"><Ltr>{r.pass} / {total}</Ltr></td>
                        <td className="px-4 py-3 text-ink">{r.critical}</td>
                        <td className="px-4 py-3 text-ink">{r.high}</td>
                        <td className="px-4 py-3 text-soft">{d.judge[r.judge] ?? r.judge}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="px-4 py-3 text-soft">{d.rounds.partialNote}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title={d.categories.heading} intro={d.categories.intro}>
          <ul role="list" className="space-y-5">
            {QUALITY_DATA.categories.map((c) => {
              const a = first.categories[c];
              const b = latest.categories[c];
              return (
                <li key={c}>
                  <p className="mb-2 text-sm font-semibold text-ink">{d.categories.names[c] ?? c}</p>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs text-soft">{d.categories.first}</span>
                      <Bar value={a.pass} max={a.total} tone="older" />
                      <span className="w-14 shrink-0 text-end text-xs text-soft"><Ltr>{a.pass}/{a.total}</Ltr></span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="w-28 shrink-0 text-xs font-semibold text-ink">{d.categories.latest}</span>
                      <Bar value={b.pass} max={b.total} tone="latest" />
                      <span className="w-14 shrink-0 text-end text-xs font-semibold text-ink"><Ltr>{b.pass}/{b.total}</Ltr></span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>

        <Section title={d.changes.heading} intro={d.changes.intro}>
          <ol className="space-y-5">
            {rounds.map((r) => (
              <li key={r.id} className="rounded-wakil border border-ink/10 bg-slip p-4">
                <p className="font-semibold text-ink">{d.roundNames[r.id] ?? r.id} <span className="text-sm font-normal text-soft">· <Ltr>{fmtDate(r.date)}</Ltr></span></p>
                {r.fixes.length === 0 ? (
                  r.id === "original" ? null : <p className="mt-2 text-sm text-soft">{d.changes.none}</p>
                ) : (
                  <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-ink">
                    {r.fixes.map((f) => <li key={f}>{d.changes.items[f] ?? f}</li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        </Section>

        <Section title={d.open.heading} intro={d.open.intro}>
          <ul className="list-disc space-y-2 ps-5 text-ink">
            {QUALITY_DATA.open.map((k) => <li key={k}>{d.open.items[k] ?? k}</li>)}
          </ul>
        </Section>

        <Section title={d.how.heading}>
          <ol className="grid gap-4 sm:grid-cols-2">
            {d.how.steps.map((s, i) => (
              <li key={s.title} className="rounded-wakil border border-ink/10 bg-slip p-4">
                <p className="text-sm font-semibold text-blue">{i + 1}</p>
                <p className="mt-1 font-semibold text-ink">{s.title}</p>
                <p className="mt-1 text-sm text-soft">{s.text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title={d.limits.heading}>
          <ul className="list-disc space-y-2 ps-5 text-ink">
            {d.limits.items.map((t) => <li key={t}>{t}</li>)}
          </ul>
          <p className="mt-4 text-sm text-soft">{fill(d.limits.model, { model: QUALITY_DATA.model })}</p>
        </Section>

        <Reveal>
          <section className="mt-16 rounded-wakil-lg border border-ink/10 bg-slip p-6 shadow-ink sm:p-8">
            <p className="max-w-2xl text-lg text-ink">{d.cta.text}</p>
            <RouteButton to="/signup" variant="primary" className="mt-5 bg-red text-slip shadow-ink-sm">{d.cta.button}</RouteButton>
          </section>
        </Reveal>
      </main>
      <footer className="border-t border-ink/10 bg-paper">
        <div className="mx-auto flex max-w-5xl flex-wrap gap-x-5 gap-y-2 px-4 py-8 text-sm text-soft sm:px-6">
          <RouteLink to={HOME_PATHS[locale]}>{d.footer.home}</RouteLink>
          <RouteLink to="/privacy">{d.footer.privacy}</RouteLink>
          <RouteLink to="/terms">{d.footer.terms}</RouteLink>
        </div>
      </footer>
    </div>
  );
}

export function QualityRoute({ locale }: { locale: Lang }) {
  const d = use(loadQuality(locale));
  return <Quality locale={locale} d={d} />;
}
