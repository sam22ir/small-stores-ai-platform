import { motion } from "motion/react";
import { landing, useI18n } from "../lib/i18n";
import { LOCALE_PATHS } from "./landing/useLandingHead";
import { Logo } from "../components/wakil/Logo";
import { RouteButton } from "../components/wakil/RouteLink";
import { ZelligeBackground } from "../components/wakil/ZelligeBackground";
import { dur, ease, useMotionSafe } from "../lib/motion";

// Catch-all page for unknown URLs. Trilingual through the app language.
export function NotFound() {
  const { lang } = useI18n();
  const d = landing[lang];
  const reduced = useMotionSafe();
  return (
    <div dir={d.dir} lang={d.htmlLang} className="relative grid min-h-screen place-items-center overflow-hidden bg-paper px-4 text-center text-ink">
      <ZelligeBackground />
      <motion.div
        className="relative max-w-md"
        initial={reduced ? false : { opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: dur.base, ease: ease.out }}
      >
        <div className="flex justify-center"><Logo /></div>
        <p className="mt-10 text-6xl font-extrabold text-red" aria-hidden="true">404</p>
        <h1 className="mt-3 text-2xl font-extrabold">{d.notFound.title}</h1>
        <p className="mt-2 text-soft">{d.notFound.text}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <RouteButton
            to={LOCALE_PATHS[lang]}
            variant="primary"
            className="bg-red text-slip shadow-ink active:translate-x-[2px] active:translate-y-[2px] active:shadow-none transition-[transform,box-shadow] duration-150"
          >
            {d.notFound.home}
          </RouteButton>
          <RouteButton to="/login" variant="secondary">{d.notFound.login}</RouteButton>
        </div>
      </motion.div>
    </div>
  );
}
