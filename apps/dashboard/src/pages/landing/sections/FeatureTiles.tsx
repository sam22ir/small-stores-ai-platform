// The six promises as tiles. Each tile has a small control you can tap to see that promise at work,
// in the order of `promises.items`: stock on/off changes the reply, a handoff, wilaya fees,
// order-taking (off by default, like in the product), a Telegram alert, and a language cycler.
import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLandingCopy } from "../../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../../lib/motion";
import { DmBubble } from "../../../components/wakil/DmBubble";
import { CountUp } from "../../../components/wakil/CountUp";
import { Stamp } from "../../../components/wakil/Stamp";
import { Reveal } from "../../../components/wakil/Reveal";
import { Spotlight, Toggle } from "../../../components/wakil/Interact";
import { BellIcon, ReplayIcon, WILAYAS } from "./bits";

// Swaps one bubble for the next with a short slide; `k` decides when it counts as new.
function Swap({ k, children }: { k: string; children: React.ReactNode }) {
  const reduced = useMotionSafe();
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={k}
        initial={reduced ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        transition={{ duration: dur.short * 0.7, ease: ease.out }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

const chipBtn =
  "rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-blue";

function StockDemo() {
  const d = useLandingCopy();
  const [inStock, setInStock] = useState(true);
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-paper px-3 py-2 text-sm">
        <span className="font-semibold" dir="ltr">{d.play.stockToggle}</span>
        <span className="flex items-center gap-2">
          <Swap k={String(inStock)}>
            <span className={`text-xs font-bold ${inStock ? "text-blue" : "text-red"}`}>{inStock ? d.play.inStock : d.play.soldOut}</span>
          </Swap>
          <Toggle on={inStock} onChange={setInStock} label={d.play.stockToggle} />
        </span>
      </div>
      <div dir="ltr">
        <Swap k={String(inStock)}>
          <DmBubble variant="out">{inStock ? "Ih kayen, noir M b 3,200 DA ✓" : "Smahli, noir M ma bqatch f stock."}</DmBubble>
        </Swap>
      </div>
    </div>
  );
}

const LANG_SAMPLES = [
  { q: "Chhal l'hoodie?", a: "3,200 DA, kayen f M w L.", lang: undefined },
  { q: "C'est combien le hoodie ?", a: "3 200 DA, disponible en M et L.", lang: "fr" },
  { q: "بشحال الهودي؟", a: "3,200 دج، متوفر بمقاس M و L.", lang: "ar" },
];

function LangDemo() {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [i, setI] = useState(0);
  const s = LANG_SAMPLES[i];
  return (
    <motion.button
      type="button"
      onClick={() => setI((n) => (n + 1) % LANG_SAMPLES.length)}
      aria-label={d.play.langsTap}
      className="block w-full space-y-2 rounded-xl text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue"
      whileTap={reduced ? undefined : { scale: 0.98 }}
      dir="ltr"
    >
      <Swap k={`q${i}`}>
        <DmBubble variant="in" lang={s.lang}>{s.q}</DmBubble>
      </Swap>
      <Swap k={`a${i}`}>
        <DmBubble variant="out" lang={s.lang}>{s.a}</DmBubble>
      </Swap>
      <span className="flex items-center justify-center gap-1.5 pt-1" aria-hidden="true">
        {LANG_SAMPLES.map((_, j) => (
          <motion.span
            key={j}
            className="h-1.5 w-4 rounded-full bg-blue origin-center"
            initial={false}
            animate={{ opacity: j === i ? 1 : 0.2, scaleX: j === i ? 1 : 0.5 }}
            transition={{ duration: dur.short, ease: ease.out }}
          />
        ))}
      </span>
    </motion.button>
  );
}

function FeeDemo() {
  const d = useLandingCopy();
  const [w, setW] = useState(1);
  return (
    <div>
      <div role="radiogroup" aria-label={d.demo.wilaya} className="flex flex-wrap gap-1.5" dir="ltr">
        {WILAYAS.map((x, i) => (
          <button
            key={x.name}
            type="button"
            role="radio"
            aria-checked={i === w}
            onClick={() => setW(i)}
            className={`${chipBtn} ${i === w ? "border-blue bg-blue text-slip" : "border-ink/15 bg-paper text-ink hover:border-blue"}`}
          >
            {x.name}
          </button>
        ))}
      </div>
      <p className="mt-4 text-3xl font-extrabold text-blue" dir="ltr">
        <CountUp to={WILAYAS[w].fee} duration={0.5} /> <span className="text-base">DA</span>
      </p>
    </div>
  );
}

function HandoffDemo() {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [sent, setSent] = useState(false);
  return (
    <div className="space-y-2.5">
      <AnimatePresence mode="wait" initial={false}>
        {sent ? (
          <motion.div key="sent" className="space-y-2.5" exit={{ opacity: 0 }}>
            <DmBubble variant="in" lang="ar" animate>عندي مشكل في طلبي، ممكن نهدر مع البائع؟</DmBubble>
            <div className="flex items-center gap-2">
              <motion.span
                className="grid size-7 shrink-0 place-items-center rounded-full bg-red text-slip"
                initial={reduced ? false : { scale: 0 }}
                animate={reduced ? { scale: 1 } : { scale: 1, rotate: [0, -16, 14, -8, 0] }}
                transition={{ duration: 0.6, delay: 0.35 }}
              >
                <BellIcon className="size-3.5" />
              </motion.span>
              <DmBubble variant="note" animate delay={0.3} className="max-w-none flex-1">{d.play.handoffDone}</DmBubble>
            </div>
          </motion.div>
        ) : (
          <motion.div key="idle" aria-hidden="true" className="h-11 w-2/3 rounded-2xl rounded-es-sm border border-dashed border-ink/20" exit={{ opacity: 0 }} />
        )}
      </AnimatePresence>
      <button
        type="button"
        onClick={() => setSent((s) => !s)}
        className={`${chipBtn} inline-flex items-center gap-1.5 border-red/40 text-red hover:bg-red/5`}
      >
        {sent ? <ReplayIcon className="size-3.5" /> : <BellIcon className="size-3.5" />}
        {sent ? d.play.replay : d.play.handoffBtn}
      </button>
    </div>
  );
}

// A Telegram notification lands on a phone-like card, with a little bell ring.
function TelegramDemo() {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [n, setN] = useState(0);
  return (
    <div className="space-y-3">
      <div className="relative min-h-[4.5rem]" aria-live="polite">
        <AnimatePresence mode="popLayout" initial={false}>
          {n > 0 && (
            <motion.div
              key={n}
              className="flex items-start gap-3 rounded-xl bg-paper p-3 shadow-paper"
              initial={reduced ? false : { opacity: 0, y: -16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: dur.short, ease: ease.stamp }}
            >
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-[#29a9eb] text-slip">
                <svg viewBox="0 0 24 24" className="size-4" fill="currentColor"><path d="M21.5 4.2 2.9 11.4c-1.2.5-1.2 1.2-.2 1.5l4.8 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.5l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.8-1.4-1.5ZM8.8 14.1l9.1-5.8c.4-.3.8-.1.5.2l-7.6 6.9-.3 3.2-1.7-4.5Z" /></svg>
              </span>
              <span className="min-w-0">
                <span className="block text-xs text-soft">Telegram · Wakil</span>
                <span className="block text-sm font-bold">{d.play.alertTitle}</span>
                <span className="block text-xs text-soft">{d.play.alertText}</span>
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        {n === 0 && <div aria-hidden="true" className="h-16 rounded-xl border border-dashed border-ink/20" />}
      </div>
      <button
        type="button"
        onClick={() => setN((x) => x + 1)}
        className={`${chipBtn} inline-flex items-center gap-1.5 border-blue/40 text-blue hover:bg-blue/5`}
      >
        <motion.span key={n} className="inline-flex" animate={reduced || n === 0 ? undefined : { rotate: [0, -18, 14, -8, 0] }} transition={{ duration: 0.6 }}>
          <BellIcon className="size-3.5" />
        </motion.span>
        {d.play.alertTitle}
      </button>
    </div>
  );
}

function OrdersDemo() {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [on, setOn] = useState(false);
  return (
    <div>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-ink/10 bg-paper px-3 py-2">
        <span className="text-sm font-semibold">{d.play.ordersToggle}</span>
        <Toggle on={on} onChange={setOn} label={d.play.ordersToggle} tone="bg-red" />
      </div>
      <p className="mt-2 text-xs text-soft">{on ? d.play.ordersOn : d.play.ordersOff}</p>
      <AnimatePresence initial={false}>
        {on && (
          <motion.div
            className="relative mt-3 flex items-center justify-between gap-3 rounded-lg bg-paper px-3 py-2.5 text-sm shadow-paper"
            initial={reduced ? false : { opacity: 0, y: -10, rotate: -3 }}
            animate={{ opacity: 1, y: 0, rotate: 1 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: dur.short, ease: ease.out }}
          >
            <span>
              <span className="block font-bold">{d.slip.title}</span>
              <span className="block text-xs text-soft" dir="ltr">Hoodie noir · M · 3,600 DA</span>
            </span>
            <Stamp intro className="text-[0.55rem]!" delay={0.25}>{d.slip.stamp}</Stamp>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const DEMOS = [StockDemo, HandoffDemo, FeeDemo, OrdersDemo, TelegramDemo, LangDemo];

export function FeatureTiles({ icons }: { icons: string[] }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  return (
    <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" role="list">
      {d.promises.items.map((f, i) => {
        const Demo = DEMOS[i];
        return (
          <li key={f.title}>
            <Reveal delay={(i % 3) * 0.08} className="h-full">
              <motion.div
                className="group relative flex h-full flex-col overflow-hidden rounded-2xl border border-ink/10 bg-slip p-5 shadow-paper sm:p-6"
                whileHover={reduced ? undefined : { y: -3 }}
                transition={{ duration: dur.short, ease: ease.out }}
              >
                <Spotlight tone="bg-red/10" />
                <div className="relative min-h-[8.5rem]">{Demo && <Demo />}</div>
                <div className="relative mt-5 border-t border-dashed border-ink/15 pt-4">
                  <h3 className="flex items-center gap-2.5 text-lg font-bold">
                    <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-blue/10 text-blue transition-colors group-hover:bg-blue group-hover:text-slip">
                      <svg aria-hidden="true" viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d={icons[i % icons.length]} />
                      </svg>
                    </span>
                    {f.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-soft">{f.text}</p>
                </div>
              </motion.div>
            </Reveal>
          </li>
        );
      })}
    </ul>
  );
}
