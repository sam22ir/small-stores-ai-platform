// "How it works" as a stepper. Each step has a small working mock beside it:
// paste a stock list, switch Instagram on, then watch a chat that needs the owner come in.
// Each mock plays its own action once the section is on screen, and can be tapped by hand.
// While the section is on screen it moves through the steps once; the first tap stops that.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useLandingCopy } from "../../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../../lib/motion";
import { CountUp } from "../../../components/wakil/CountUp";
import { Toggle } from "../../../components/wakil/Interact";
import { BellIcon, CheckIcon, PasteIcon } from "./bits";

const STEP_MS = 6000;

const PRODUCTS = [
  { name: "Hoodie noir", price: "3,200", stock: 12 },
  { name: "Jean slim", price: "4,500", stock: 5 },
  { name: "Casquette", price: "1,200", stock: 0 },
];

function PastePanel({ live }: { live: boolean }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [pasted, setPasted] = useState(reduced);
  useEffect(() => {
    if (reduced || !live) return;
    const id = window.setTimeout(() => setPasted(true), 900);
    return () => window.clearTimeout(id);
  }, [reduced, live]);

  return (
    <div>
      <motion.button
        type="button"
        onClick={() => setPasted((p) => !p)}
        aria-pressed={pasted}
        className="inline-flex items-center gap-2 rounded-lg bg-slip px-3 py-2 text-sm font-bold text-ink shadow-ink-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slip"
        whileTap={reduced ? undefined : { scale: 0.95, x: 1, y: 1 }}
      >
        <PasteIcon className="size-4" />
        {d.play.paste}
      </motion.button>
      <ul className="mt-4 space-y-2" role="list" dir="ltr">
        {PRODUCTS.map((p, i) => (
          <motion.li
            key={p.name}
            className="flex items-center justify-between gap-3 rounded-lg border border-slip/15 px-3 py-2 text-sm"
            initial={false}
            animate={
              pasted
                ? { opacity: 1, x: 0, backgroundColor: "rgba(255,255,255,0.08)" }
                : { opacity: 0.45, x: reduced ? 0 : -6, backgroundColor: "rgba(255,255,255,0)" }
            }
            transition={{ duration: dur.short, ease: ease.out, delay: pasted ? i * 0.12 : 0 }}
          >
            <span className="font-semibold">{p.name}</span>
            <span className="flex items-center gap-2">
              <span className="tabular-nums text-paper/80">{p.price} DA</span>
              <AnimatePresence initial={false}>
                {pasted && (
                  <motion.span
                    className={`rounded-full px-2 py-0.5 text-[0.7rem] font-bold ${p.stock > 0 ? "bg-slip text-blue" : "bg-red text-slip"}`}
                    initial={reduced ? false : { opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.6 }}
                    transition={{ duration: dur.short, ease: ease.stamp, delay: reduced ? 0 : 0.2 + i * 0.12 }}
                  >
                    {p.stock > 0 ? `${p.stock} ${d.play.inStock}` : d.play.soldOut}
                  </motion.span>
                )}
              </AnimatePresence>
            </span>
          </motion.li>
        ))}
      </ul>
      <p className="mt-3 flex h-5 items-center gap-1.5 text-sm text-paper/80" aria-live="polite">
        {pasted && (
          <>
            <CheckIcon className="size-4 text-slip" />
            {d.play.pasted}
          </>
        )}
      </p>
    </div>
  );
}

function ConnectPanel({ live }: { live: boolean }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [on, setOn] = useState(reduced);
  useEffect(() => {
    if (reduced || !live) return;
    const id = window.setTimeout(() => setOn(true), 1000);
    return () => window.clearTimeout(id);
  }, [reduced, live]);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 rounded-xl border border-slip/15 bg-slip/5 p-3">
        <span
          aria-hidden="true"
          className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(45deg,#f9a825,#e1306c,#833ab4)] text-slip"
        >
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" /></svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{d.play.connect}</p>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={on ? "on" : "off"}
              className={`text-xs ${on ? "text-slip" : "text-paper/60"}`}
              initial={reduced ? false : { opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: dur.micro }}
              dir="ltr"
            >
              {on ? `@yourstore · ${d.play.connected}` : "@yourstore"}
            </motion.p>
          </AnimatePresence>
        </div>
        <Toggle on={on} onChange={setOn} label={d.play.connect} tone="bg-red" />
      </div>
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-slip/15 p-3 opacity-60">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-slip/10">
          <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.4S17 3 12 3Z" /></svg>
        </span>
        <p className="text-sm font-semibold">{d.play.messengerSoon}</p>
      </div>
    </div>
  );
}

function RepliesPanel({ live }: { live: boolean }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [alert, setAlert] = useState(reduced);
  useEffect(() => {
    if (reduced || !live) return;
    const id = window.setTimeout(() => setAlert(true), 1600);
    return () => window.clearTimeout(id);
  }, [reduced, live]);

  return (
    <div className="relative">
      <div className="flex items-baseline gap-2">
        <span className="text-4xl font-extrabold text-slip">
          <CountUp to={27} duration={1.4} viewOnce />
        </span>
        <span className="text-sm text-paper/80">{d.play.answered}</span>
      </div>
      <div className="mt-4 space-y-2" aria-hidden="true">
        {[0.9, 0.7, 0.8].map((w, i) => (
          <motion.div
            key={i}
            className="h-2.5 rounded-full bg-slip/15 origin-left rtl:origin-right"
            style={{ width: `${w * 100}%` }}
            initial={reduced ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: dur.base, ease: ease.out, delay: 0.2 + i * 0.15 }}
          />
        ))}
      </div>
      <AnimatePresence>
        {alert && (
          <motion.button
            type="button"
            onClick={() => setAlert(false)}
            className="mt-5 flex w-full items-start gap-3 rounded-xl bg-slip p-3 text-start text-ink shadow-paper"
            initial={reduced ? false : { opacity: 0, y: -14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.96 }}
            transition={{ duration: dur.short, ease: ease.stamp }}
          >
            <motion.span
              className="grid size-9 shrink-0 place-items-center rounded-full bg-red text-slip"
              animate={reduced ? undefined : { rotate: [0, -14, 12, -8, 6, 0] }}
              transition={{ duration: 0.7, delay: 0.25 }}
            >
              <BellIcon className="size-4" />
            </motion.span>
            <span>
              <span className="block text-sm font-bold">{d.play.alertTitle}</span>
              <span className="block text-xs text-soft">{d.play.alertText}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      {!alert && (
        <button
          type="button"
          onClick={() => setAlert(true)}
          className="mt-5 inline-flex items-center gap-2 rounded-lg border border-slip/20 px-3 py-2 text-sm font-semibold text-slip hover:bg-slip/10 focus-visible:outline-2 focus-visible:outline-slip"
        >
          <BellIcon className="size-4" />
          {d.play.alertTitle}
        </button>
      )}
    </div>
  );
}

const PANELS = [PastePanel, ConnectPanel, RepliesPanel];

export function StepsPlay() {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { amount: 0.4 });
  const [step, setStep] = useState(0);
  const [manual, setManual] = useState(false);
  const last = d.steps.items.length - 1;
  // One guided pass is enough: it stops on the last step instead of looping.
  const auto = inView && !manual && !reduced && step < last;

  useEffect(() => {
    if (!auto) return;
    const id = window.setTimeout(() => setStep((s) => Math.min(s + 1, last)), STEP_MS);
    return () => window.clearTimeout(id);
  }, [auto, step, last]);

  const Panel = PANELS[step];

  return (
    <div ref={ref} className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-10">
      <div>
        <div role="tablist" aria-label={d.steps.heading} className="grid gap-3">
          {d.steps.items.map((s, i) => {
            const active = i === step;
            return (
              <motion.button
                key={s.title}
                type="button"
                role="tab"
                id={`step-tab-${i}`}
                aria-selected={active}
                aria-controls="step-panel"
                onClick={() => { setManual(true); setStep(i); }}
                className={`relative overflow-hidden rounded-2xl border p-5 text-start transition-colors duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slip ${
                  active ? "border-slip/40 bg-slip/10" : "border-slip/10 bg-transparent hover:border-slip/25 hover:bg-slip/5"
                }`}
                whileTap={reduced ? undefined : { scale: 0.985 }}
              >
                <span className="flex items-center gap-3">
                  <span
                    className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-extrabold transition-colors duration-300 ${
                      active ? "bg-red text-slip" : "bg-slip/10 text-paper/80"
                    }`}
                  >
                    {i + 1}
                  </span>
                  <span>
                    <em className="block not-italic text-[0.7rem] font-bold uppercase tracking-widest text-paper/60">{s.k}</em>
                    <span className="block text-lg font-bold">{s.title}</span>
                  </span>
                </span>
                <AnimatePresence initial={false}>
                  {active && (
                    <motion.p
                      className="ps-11 text-sm leading-relaxed text-paper/80"
                      initial={reduced ? false : { opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: dur.short, ease: ease.out }}
                    >
                      <span className="block pt-2">{s.text}</span>
                    </motion.p>
                  )}
                </AnimatePresence>
                {active && auto && (
                  <motion.span
                    key={`bar${step}`}
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-0.5 bg-red origin-left rtl:origin-right"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: STEP_MS / 1000, ease: "linear" }}
                  />
                )}
              </motion.button>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-paper/60">{d.play.stepsHint}</p>
      </div>

      <div
        id="step-panel"
        role="tabpanel"
        aria-labelledby={`step-tab-${step}`}
        className="relative min-h-[17rem] overflow-hidden rounded-2xl border border-slip/15 bg-slip/5 p-5 sm:p-6"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={reduced ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: dur.short, ease: ease.out }}
          >
            <Panel live={inView} />
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
