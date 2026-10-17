import { lazy, Suspense, use, useRef, useState } from "react";
import { Accordion, Card } from "@heroui/react";
import { motion, useInView, useMotionValueEvent, useScroll, useSpring } from "motion/react";
import { LandingCopy, loadLanding, useI18n, useLandingCopy } from "../../lib/i18n";
import type { Lang } from "../../lib/i18n";
import { useSignedIn } from "./useSignedIn";
import { dur, ease, useMotionSafe } from "../../lib/motion";
import { DmBubble } from "../../components/wakil/DmBubble";
import { Magnetic } from "../../components/wakil/Interact";
import { Reveal } from "../../components/wakil/Reveal";
import { ZelligeBackground } from "../../components/wakil/ZelligeBackground";
import { CountUp } from "../../components/wakil/CountUp";
import { Logo } from "../../components/wakil/Logo";
import { RouteButton, RouteLink } from "../../components/wakil/RouteLink";
import { LANDING_LOCALES, LOCALE_PATHS, useLandingHead } from "./useLandingHead";
import { HeroDemo } from "./sections/HeroDemo";
import { ChatCards } from "./sections/ChatCards";
import { StepsPlay } from "./sections/StepsPlay";
import { FeatureTiles } from "./sections/FeatureTiles";
import { TimeBack } from "./sections/TimeBack";

// The live demo is the heaviest block on this page: it loads only when it nears the viewport.
const LiveDemo = lazy(() => import("./LiveDemo"));

const LANG_NAMES: Record<Lang, string> = { ar: "العربية", fr: "Français", en: "English" };

function Nav({ locale, signedIn }: { locale: Lang; signedIn: boolean }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const { scrollY, scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 200, damping: 30, restDelta: 0.001 });
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
          {signedIn ? (
            <RouteButton to="/inbox" variant="secondary" size="sm" className="hidden sm:inline-flex">
              {d.nav.goInbox}
            </RouteButton>
          ) : (
            <RouteLink to="/login" className="hidden text-sm font-semibold text-ink sm:inline-flex">
              {d.nav.logIn}
            </RouteLink>
          )}
          <Magnetic className="hidden sm:inline-flex" strength={0.2}>
            <RouteButton
              to={signedIn ? "/inbox" : "/signup"}
              variant="primary"
              size="sm"
              className="whitespace-nowrap bg-red text-slip shadow-ink-sm active:translate-x-[1px] active:translate-y-[1px] active:shadow-none transition-[transform,box-shadow] duration-150"
            >
              {signedIn ? d.nav.goInbox : d.nav.startFree}
            </RouteButton>
          </Magnetic>
        </div>
      </nav>
      {/* Reading progress: a thin red bar along the bottom of the header. */}
      <motion.div
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-px h-0.5 bg-red origin-left rtl:origin-right"
        style={{ scaleX: reduced ? scrollYProgress : progress }}
      />
    </header>
  );
}

function Hero({ locale, signedIn }: { locale: Lang; signedIn: boolean }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const intro = (delay: number) =>
    reduced ? { initial: false as const } : { initial: { opacity: 0, y: 18 }, animate: { opacity: 1, y: 0 }, transition: { duration: dur.base, ease: ease.out, delay } };

  return (
    <section className="relative overflow-hidden" aria-labelledby="hero-title">
      <ZelligeBackground className="[mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-12 pb-16 sm:px-6 sm:pt-20 lg:grid-cols-2 lg:gap-16">
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
            <Magnetic>
              <RouteButton
                to={signedIn ? "/inbox" : "/signup"}
                variant="primary"
                size="lg"
                className="bg-red text-slip shadow-ink active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow] duration-150"
              >
                {signedIn ? d.nav.goInbox : d.hero.cta}
              </RouteButton>
            </Magnetic>
            <small className="text-sm text-soft">{d.hero.ctaNote}</small>
          </motion.div>
        </div>

        <HeroDemo />
      </div>
    </section>
  );
}

function Chats() {
  const d = useLandingCopy();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="chats-title">
      <Reveal>
        <h2 id="chats-title" className="text-2xl font-extrabold sm:text-3xl">{d.chats.heading}</h2>
        <p className="mt-2 max-w-2xl text-soft">{d.chats.intro}</p>
      </Reveal>
      <ChatCards />
    </section>
  );
}

function Steps() {
  const d = useLandingCopy();
  return (
    <section className="relative bg-ink text-slip" aria-labelledby="steps-title">
      <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <Reveal>
          <h2 id="steps-title" className="text-2xl font-extrabold sm:text-3xl">{d.steps.heading}</h2>
        </Reveal>
        <StepsPlay />
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
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-label={d.demo.heading}>
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

function Features() {
  const d = useLandingCopy();
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="features-title">
      <Reveal>
        <h2 id="features-title" className="text-2xl font-extrabold sm:text-3xl">{d.features.heading}</h2>
      </Reveal>
      <FeatureTiles />
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
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="pricing-title">
      <Reveal>
        <Card className="relative overflow-hidden bg-slip p-8 shadow-paper sm:p-12">
          <ZelligeBackground className="opacity-[0.04]" />
          <div className="relative grid items-center gap-8 lg:grid-cols-2 lg:gap-12">
            <div>
              <h2 id="pricing-title" className="text-2xl font-extrabold sm:text-3xl">{d.pricing.heading}</h2>
              <p className="mt-4 text-4xl font-extrabold text-blue sm:text-5xl">
                <CountUp to={1000} viewOnce format={priceText} />
              </p>
              <p className="mt-1 text-sm font-semibold text-soft">{d.pricing.per}</p>
              <p className="mt-5 max-w-xl text-soft">{d.pricing.text}</p>
              <Magnetic className="mt-8 inline-flex">
                <RouteButton
                  to="/signup"
                  variant="primary"
                  size="lg"
                  className="bg-red text-slip shadow-ink active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow] duration-150"
                >
                  {d.pricing.cta}
                </RouteButton>
              </Magnetic>
            </div>
            <TimeBack locale={locale} />
          </div>
        </Card>
      </Reveal>
    </section>
  );
}

function Faq() {
  const d = useLandingCopy();
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 sm:px-6" aria-labelledby="faq-title">
      <Reveal>
        <h2 id="faq-title" className="text-2xl font-extrabold sm:text-3xl">{d.faq.heading}</h2>
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
              <Accordion.Body>
                <DmBubble variant="out" animate className="max-w-[92%]">{item.a}</DmBubble>
              </Accordion.Body>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </section>
  );
}

function Footer() {
  const d = useLandingCopy();
  return (
    <footer className="border-t border-ink/10 bg-paper">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-soft sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <nav aria-label={d.footer.legal} className="flex flex-wrap gap-x-5 gap-y-2">
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
        <Chats />
        <Steps />
        <Demo />
        <Features />
        <Pricing locale={locale} />
        <Faq />
      </main>
      <Footer />
    </motion.div>
  );
}

// Route entry: fetches only this locale's landing copy, then renders the page with it.
export function LandingRoute({ locale }: { locale: Lang }) {
  const copy = use(loadLanding(locale));
  return <LandingCopy.Provider value={copy}><Landing locale={locale} /></LandingCopy.Provider>;
}
