import { lazy, Suspense, use, useRef, useState } from "react";
import { Accordion, Card, Chip } from "@heroui/react";
import { motion, useInView, useMotionValueEvent, useScroll } from "motion/react";
import { LandingCopy, loadLanding, useI18n, useLandingCopy } from "../../lib/i18n";
import type { Lang } from "../../lib/i18n";
import { useSignedIn } from "./useSignedIn";
import { dur, ease, useMotionSafe } from "../../lib/motion";
import { DmBubble } from "../../components/wakil/DmBubble";
import { OrderSlip } from "../../components/wakil/OrderSlip";
import { Reveal } from "../../components/wakil/Reveal";
import { ZelligeBackground } from "../../components/wakil/ZelligeBackground";
import { CountUp } from "../../components/wakil/CountUp";
import { Logo } from "../../components/wakil/Logo";
import { RouteButton, RouteLink } from "../../components/wakil/RouteLink";
import { QUALITY_DATA } from "../../lib/qualityData.generated";
import { LANDING_LOCALES, LOCALE_PATHS, QUALITY_PATHS, useLandingHead } from "./useLandingHead";

// The live demo is the heaviest block on this page: it loads only when it nears the viewport.
const LiveDemo = lazy(() => import("./LiveDemo"));

const LANG_NAMES: Record<Lang, string> = { ar: "العربية", fr: "Français", en: "English" };

const SECTION = "mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24";
const H2 = "text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl";
const CTA = "bg-red text-slip shadow-ink transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-ink-lg active:translate-x-[2px] active:translate-y-[2px] active:shadow-none";

function Eyebrow({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "paper" }) {
  return (
    <p className={`mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest ${tone === "blue" ? "text-blue" : "text-paper/80"}`}>
      <span aria-hidden="true" className="h-px w-6 bg-current" />
      {children}
    </p>
  );
}

// Three dots that fade in, then out, before Wakil's reply lands.
function TypingDots({ delay = 0.9 }: { delay?: number }) {
  const reduced = useMotionSafe();
  if (reduced) return null;
  return (
    <motion.div
      aria-hidden="true"
      className="flex w-fit items-center gap-1.5 rounded-2xl rounded-ee-sm bg-blue/10 px-3.5 py-3 ms-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1, delay, times: [0, 0.1, 0.9, 1] }}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="size-1.5 rounded-full bg-blue"
          animate={{ y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: delay + i * 0.12, ease: ease.inOut }}
        />
      ))}
    </motion.div>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16" className="size-3.5 shrink-0 text-blue" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 8.5l3.2 3L13 4.5" />
    </svg>
  );
}

function Nav({ locale, signedIn }: { locale: Lang; signedIn: boolean }) {
  const d = useLandingCopy();
  const { scrollY } = useScroll();
  const [compact, setCompact] = useState(false);
  useMotionValueEvent(scrollY, "change", (v) => setCompact(v > 24));

  return (
    <header
      className={`sticky top-0 z-40 border-b border-ink/10 bg-paper/90 backdrop-blur transition-[padding,box-shadow] duration-300 ${
        compact ? "py-2 shadow-paper" : "py-4"
      }`}
    >
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <RouteLink to={LOCALE_PATHS[locale]}>
          <Logo />
        </RouteLink>
        <div className="flex items-center gap-2 sm:gap-3">
          <ul role="list" aria-label={d.nav.langLabel} className="flex items-center gap-1 rounded-full border border-ink/15 bg-slip p-1">
            {LANDING_LOCALES.map((l) => {
              const active = l === locale;
              return (
                <li key={l} className="relative">
                  {active && (
                    <motion.span
                      layoutId="lang-pill"
                      className="absolute inset-0 rounded-full bg-ink"
                      transition={{ duration: dur.short, ease: ease.out }}
                    />
                  )}
                  <RouteLink to={LOCALE_PATHS[l]}>
                    <span
                      lang={l}
                      aria-current={active ? "page" : undefined}
                      className={`relative block rounded-full px-2.5 py-1 text-xs font-semibold transition-colors ${
                        active ? "text-slip" : "text-ink hover:text-blue"
                      }`}
                    >
                      {LANG_NAMES[l]}
                    </span>
                  </RouteLink>
                </li>
              );
            })}
          </ul>
          <RouteLink to={QUALITY_PATHS[locale]} className="hidden text-sm font-semibold text-ink md:inline-flex">
            {d.nav.quality}
          </RouteLink>
          {signedIn ? (
            <RouteButton to="/inbox" variant="secondary" size="sm" className="hidden sm:inline-flex">
              {d.nav.goInbox}
            </RouteButton>
          ) : (
            <RouteLink to="/login" className="hidden text-sm font-semibold text-ink sm:inline-flex">
              {d.nav.logIn}
            </RouteLink>
          )}
          <RouteButton
            to={signedIn ? "/inbox" : "/signup"}
            variant="primary"
            size="sm"
            className="hidden whitespace-nowrap bg-red text-slip shadow-ink-sm sm:inline-flex active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-[transform,box-shadow] duration-150"
          >
            {signedIn ? d.nav.goInbox : d.nav.startFree}
          </RouteButton>
        </div>
      </nav>
    </header>
  );
}

function Hero({ locale, signedIn }: { locale: Lang; signedIn: boolean }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const intro = (delay: number) =>
    reduced ? { initial: false as const } : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: dur.base, ease: ease.out, delay } };
  const sample = d.chats.items[0];

  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <ZelligeBackground className="[mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:grid-cols-2 lg:gap-16">
        <div>
          {d.hero.kicker && (
            <motion.p lang="ar" dir="rtl" className="mb-4 text-sm font-semibold text-blue" {...intro(0)}>
              {d.hero.kicker}
            </motion.p>
          )}
          <motion.h1
            id="hero-title"
            className={`font-extrabold leading-[1.15] tracking-tight text-ink ${
              locale === "ar" ? "text-4xl sm:text-6xl" : "text-3xl sm:text-5xl"
            }`}
            {...intro(0.1)}
          >
            {d.hero.h1}
          </motion.h1>
          <motion.p className="mt-5 max-w-xl text-base leading-relaxed text-soft sm:text-lg" {...intro(0.25)}>
            {d.hero.lede}
          </motion.p>
          <motion.div className="mt-8 flex flex-wrap items-center gap-4" {...intro(0.4)}>
            <RouteButton
              to={signedIn ? "/inbox" : "/signup"}
              variant="primary"
              size="lg"
              className={CTA}
            >
              {signedIn ? d.nav.goInbox : d.hero.cta}
            </RouteButton>
            <small className="text-sm text-soft">{d.hero.ctaNote}</small>
          </motion.div>
          <motion.ul role="list" className="mt-8 flex flex-wrap gap-2" {...intro(0.5)}>
            {d.hero.chips.map((c) => (
              <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-slip px-3 py-1.5 text-xs font-semibold text-ink">
                <Check /> {c}
              </li>
            ))}
          </motion.ul>
          <motion.p className="mt-5 text-sm" {...intro(0.6)}>
            <RouteLink to={QUALITY_PATHS[locale]} className="font-semibold text-blue underline underline-offset-4">
              {d.hero.qualityLink} <span aria-hidden="true" className="inline-block rtl:rotate-180">→</span>
            </RouteLink>
          </motion.p>
        </div>

        <figure className="relative mx-auto w-full max-w-md">
          <div className="space-y-3">
            <DmBubble variant="in" animate delay={0.2}>{sample.customer}</DmBubble>
            <TypingDots delay={0.9} />
            <DmBubble variant="out" animate delay={1.9}>{sample.reply}</DmBubble>
          </div>
          <div className="mt-8">
            <OrderSlip
              intro
              delay={2.4}
              title={d.slip.title}
              sub={d.slip.sub}
              rows={[
                { label: d.slip.client, value: "Amina B." },
                { label: d.slip.phone, value: "0555 •• •• 21", ltr: true },
                { label: d.slip.wilaya, value: d.slip.wilayaValue },
                { label: d.slip.item, value: d.slip.itemValue },
                { label: d.slip.delivery, value: "400 DA" },
              ]}
              total={{ label: d.slip.total, value: "3,600 DA" }}
              stamp={d.slip.stamp}
              trail={d.slip.trail}
            />
          </div>
          <figcaption className="mt-10 text-center text-xs text-soft">{d.hero.slipCaption}</figcaption>
        </figure>
      </div>
    </section>
  );
}

function Chats() {
  const d = useLandingCopy();
  return (
    <section className={SECTION} aria-labelledby="chats-title">
      <Reveal>
        <h2 id="chats-title" className={H2}>{d.chats.heading}</h2>
        <p className="mt-2 max-w-2xl text-soft">{d.chats.intro}</p>
      </Reveal>
      <ul className="mt-10 grid gap-5 md:grid-cols-3" role="list">
        {d.chats.items.map((c, i) => (
          <li key={i}>
            <Reveal delay={i * 0.1} className="h-full">
              <Card className="h-full bg-slip p-4 shadow-paper">
                <div className="space-y-2.5">
                  <DmBubble variant="in" lang={c.customerLang}>{c.customer}</DmBubble>
                  <DmBubble variant="out" lang={c.replyLang}>{c.reply}</DmBubble>
                </div>
                {c.tag && <Chip className="mt-4 bg-red/10 text-red" size="sm">{c.tag}</Chip>}
              </Card>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Steps() {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  return (
    <section className="relative bg-ink text-slip" aria-labelledby="steps-title">
      <div className={SECTION}>
        <Reveal>
          <h2 id="steps-title" className={H2}>{d.steps.heading}</h2>
        </Reveal>
        <ol className="mt-10 grid gap-5 md:grid-cols-3">
          {d.steps.items.map((s, i) => (
            <motion.li
              key={s.title}
              className="rounded-2xl border border-slip/15 bg-slip/5 p-6"
              initial={reduced ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: dur.base, ease: ease.out, delay: i * 0.12 }}
              whileHover={reduced ? undefined : { y: -4 }}
            >
              <em className="not-italic text-xs font-bold uppercase tracking-widest text-paper/70">{s.k}</em>
              <h3 className="mt-2 text-lg font-bold">{s.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-paper/80">{s.text}</p>
            </motion.li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Demo() {
  const d = useLandingCopy();
  const ref = useRef<HTMLDivElement>(null);
  // Mount the demo (and its code) once the placeholder is within 320px of the viewport.
  const near = useInView(ref, { once: true, margin: "320px 0px 320px 0px" });
  return (
    <section className={SECTION} aria-label={d.demo.heading}>
      <div ref={ref} className="min-h-[24rem]">
        {near ? (
          <Suspense fallback={<div className="h-96 rounded-2xl bg-slip/60" aria-hidden="true" />}>
            <LiveDemo copy={d} />
          </Suspense>
        ) : (
          <div className="h-96 rounded-2xl bg-slip/60" aria-hidden="true" />
        )}
      </div>
    </section>
  );
}

function Trust({ locale }: { locale: Lang }) {
  const d = useLandingCopy();
  const rounds = QUALITY_DATA.rounds as unknown as { kind: string; date: string; pass: number; critical: number; high: number }[];
  const latest = rounds.filter((r) => r.kind === "full").at(-1)!;
  const [y, m, day] = latest.date.split("-");
  const fill = (t: string) => t.replace("{date}", `${day}/${m}/${y}`).replace("{total}", String(QUALITY_DATA.total));
  const pct = (latest.pass / QUALITY_DATA.total) * 100;
  return (
    <section className={SECTION} aria-labelledby="trust-title">
      <Reveal>
        <Card className="relative overflow-hidden bg-slip p-6 shadow-paper sm:p-12">
          <ZelligeBackground className="opacity-[0.05]" />
          <div className="relative grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <div>
              <Eyebrow>{d.trust.eyebrow}</Eyebrow>
              <h2 id="trust-title" className={H2}>{d.trust.heading}</h2>
              <p className="mt-4 max-w-xl leading-relaxed text-soft">{d.trust.text}</p>
              <RouteButton to={QUALITY_PATHS[locale]} variant="secondary" size="lg" className="mt-7 border border-ink bg-slip text-ink shadow-ink-sm transition-[transform,box-shadow] duration-150 hover:-translate-x-px hover:-translate-y-px hover:shadow-ink active:translate-x-px active:translate-y-px active:shadow-none">
                {d.trust.cta} <span aria-hidden="true" className="rtl:rotate-180">→</span>
              </RouteButton>
              <p className="mt-4 max-w-xl text-xs leading-relaxed text-soft">{d.trust.note}</p>
            </div>
            <div className="rounded-2xl border border-ink/15 bg-paper p-6 text-center sm:p-8">
              <p className="text-xs font-bold uppercase tracking-widest text-blue">{fill(d.trust.date)}</p>
              <p dir="ltr" className="mt-3 text-6xl font-extrabold leading-none text-ink sm:text-7xl">
                <CountUp to={latest.pass} viewOnce duration={1.4} />
                <span className="text-3xl text-soft sm:text-4xl"> / {QUALITY_DATA.total}</span>
              </p>
              <p className="mt-2 text-sm font-semibold text-soft">{fill(d.trust.score)}</p>
              <div dir="ltr" className="mt-5 h-2.5 overflow-hidden rounded-full bg-ink/10" aria-hidden="true">
                <motion.div
                  dir="ltr"
                  className="h-full origin-left rounded-full bg-blue"
                  style={{ width: `${pct}%` }}
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true, amount: 0.8 }}
                  transition={{ duration: 1.2, ease: ease.out, delay: 0.2 }}
                />
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-3 text-start">
                <div className="rounded-xl bg-slip p-3">
                  <dd dir="ltr" className="text-2xl font-extrabold text-ink text-start">{latest.critical}</dd>
                  <dt className="text-xs text-soft">{d.trust.critical}</dt>
                </div>
                <div className="rounded-xl bg-slip p-3">
                  <dd dir="ltr" className="text-2xl font-extrabold text-ink text-start">{latest.high}</dd>
                  <dt className="text-xs text-soft">{d.trust.high}</dt>
                </div>
              </dl>
            </div>
          </div>
        </Card>
      </Reveal>
    </section>
  );
}

const ICONS = [
  "M4 6h16M4 12h16M4 18h10",
  "M7 11l5-5 5 5M12 6v13",
  "M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11zM12 12a2 2 0 100-4 2 2 0 000 4z",
  "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  "M21 4L3 11l6 2 2 6 3-4 5 4z",
  "M4 5h9M8.5 3v2M6 12c2-1 4-3 5-7M6 5c0 4 3 7 7 8M14 21l4-9 4 9M15.5 18h5",
];

function Promises() {
  const d = useLandingCopy();
  return (
    <section className={SECTION} aria-labelledby="promises-title">
      <Reveal>
        <Eyebrow>{d.promises.eyebrow}</Eyebrow>
        <h2 id="promises-title" className={H2}>{d.promises.heading}</h2>
      </Reveal>
      <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
        {d.promises.items.map((f, i) => (
          <li key={f.title}>
            <Reveal delay={(i % 3) * 0.08} className="h-full">
              <div className="group h-full rounded-2xl border border-ink/10 bg-slip p-6 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-paper">
                <span className="grid size-10 place-items-center rounded-xl bg-blue/10 text-blue transition-colors group-hover:bg-blue group-hover:text-slip">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d={ICONS[i % ICONS.length]} />
                  </svg>
                </span>
                <h3 className="mt-4 text-lg font-bold">{f.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-soft">{f.text}</p>
              </div>
            </Reveal>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Pricing({ locale }: { locale: Lang }) {
  const d = useLandingCopy();
  const priceText = (n: number) => {
    const num = Math.round(n).toLocaleString(locale === "ar" ? "en-US" : locale === "fr" ? "fr-FR" : "en-US");
    return d.pricing.price.replace(/\d[\d.,\s  ]*\d|\d/, num);
  };
  return (
    <section className={SECTION} aria-labelledby="pricing-title">
      <Reveal>
        <Card className="relative overflow-hidden bg-slip p-6 shadow-paper sm:p-12">
          <ZelligeBackground className="opacity-[0.04]" />
          <div className="relative">
            <h2 id="pricing-title" className={H2}>{d.pricing.heading}</h2>
            <p className="mt-4 text-4xl font-extrabold text-blue sm:text-5xl">
              <CountUp to={1000} viewOnce format={priceText} />
            </p>
            <p className="mt-1 text-sm font-semibold text-soft">{d.pricing.per}</p>
            <p className="mt-5 max-w-xl text-soft">{d.pricing.text}</p>
            <ul role="list" className="mt-6 grid gap-2.5 text-sm sm:grid-cols-2">
              {d.pricing.includes.map((x) => (
                <li key={x} className="flex items-start gap-2"><span className="mt-0.5"><Check /></span>{x}</li>
              ))}
            </ul>
            <p className="mt-6 text-sm font-semibold text-blue">{d.pricing.payNote}</p>
            <RouteButton
              to="/signup"
              variant="primary"
              size="lg"
              className={`mt-6 ${CTA}`}
            >
              {d.pricing.cta}
            </RouteButton>
          </div>
        </Card>
      </Reveal>
    </section>
  );
}

function Faq() {
  const d = useLandingCopy();
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-24" aria-labelledby="faq-title">
      <Reveal>
        <h2 id="faq-title" className={H2}>{d.faq.heading}</h2>
      </Reveal>
      <Accordion className="mt-8 w-full">
        {d.faq.items.map((item, i) => (
          <Accordion.Item key={i}>
            <Accordion.Heading>
              <Accordion.Trigger>
                {item.q}
                <Accordion.Indicator />
              </Accordion.Trigger>
            </Accordion.Heading>
            <Accordion.Panel>
              <Accordion.Body>{item.a}</Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </section>
  );
}

function FinalCta({ signedIn }: { signedIn: boolean }) {
  const d = useLandingCopy();
  return (
    <section className="bg-ink text-slip" aria-labelledby="final-title">
      <div className="mx-auto max-w-4xl px-4 py-16 text-center sm:px-6 sm:py-24">
        <Reveal>
          <h2 id="final-title" className={H2}>{d.finalCta.heading}</h2>
          <p className="mx-auto mt-4 max-w-xl text-paper/80">{d.finalCta.text}</p>
          <RouteButton to={signedIn ? "/inbox" : "/signup"} variant="primary" size="lg" className={`mt-8 ${CTA} !shadow-[4px_4px_0_var(--color-paper)]`}>
            {signedIn ? d.nav.goInbox : d.finalCta.cta}
          </RouteButton>
        </Reveal>
      </div>
    </section>
  );
}

function Footer({ locale }: { locale: Lang }) {
  const d = useLandingCopy();
  return (
    <footer className="border-t border-ink/10 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <nav aria-label={d.footer.legal} className="flex flex-wrap gap-x-5 gap-y-2">
          <RouteLink to={QUALITY_PATHS[locale]}>{d.footer.quality}</RouteLink>
          <RouteLink to="/privacy">{d.footer.privacy}</RouteLink>
          <RouteLink to="/terms">{d.footer.terms}</RouteLink>
          <RouteLink to="/data-deletion">{d.footer.dataDeletion}</RouteLink>
        </nav>
        <p>{d.footer.copyright}</p>
      </div>
    </footer>
  );
}

export function Landing({ locale }: { locale: Lang }) {
  const signedIn = useSignedIn();
  const d = useLandingCopy();
  const { lang: appLang } = useI18n();
  useLandingHead(locale, appLang);

  return (
    <motion.div
      key={locale}
      dir={d.dir}
      lang={d.htmlLang}
      className="min-h-screen overflow-x-clip bg-paper text-ink"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: dur.short, ease: ease.out }}
    >
      <Nav locale={locale} signedIn={signedIn} />
      <main>
        <Hero locale={locale} signedIn={signedIn} />
        <Trust locale={locale} />
        <Chats />
        <Promises />
        <Steps />
        <Demo />
        <Pricing locale={locale} />
        <Faq />
        <FinalCta signedIn={signedIn} />
      </main>
      <Footer locale={locale} />
    </motion.div>
  );
}

// Route entry: fetches only this locale's landing copy, then renders the page with it.
export function LandingRoute({ locale }: { locale: Lang }) {
  const copy = use(loadLanding(locale));
  return <LandingCopy.Provider value={copy}><Landing locale={locale} /></LandingCopy.Provider>;
}
