// Pricing helper: drag the slider to your DMs a day and see the replies a month and the time you
// would spend writing them. It is an estimate (about 2 minutes a reply), and the label says so.
// The slider stops at 30 a day (900 replies a month), under the plan's default monthly reply limit.
import { useId, useState } from "react";
import { motion } from "motion/react";
import { useLandingCopy } from "../../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../../lib/motion";
import { CountUp } from "../../../components/wakil/CountUp";
import type { Lang } from "../../../lib/i18n";

const MIN = 5;
const MAX = 30;
const MINUTES_PER_REPLY = 2;

export function TimeBack({ locale }: { locale: Lang }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const id = useId();
  const [perDay, setPerDay] = useState(15);
  const perMonth = perDay * 30;
  const hours = Math.round((perMonth * MINUTES_PER_REPLY) / 60);
  const fmt = (n: number) => Math.round(n).toLocaleString(locale === "fr" ? "fr-FR" : "en-US");
  const pct = ((perDay - MIN) / (MAX - MIN)) * 100;

  return (
    <div className="rounded-2xl border border-ink/10 bg-paper/70 p-5 sm:p-6">
      <p className="font-bold">{d.play.calc.heading}</p>
      <div className="mt-4 flex items-baseline gap-2">
        <motion.span
          key={perDay}
          className="text-3xl font-extrabold tabular-nums text-ink"
          initial={reduced ? false : { scale: 1.18, opacity: 0.6 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: dur.short, ease: ease.stamp }}
        >
          {perDay}
        </motion.span>
        <label htmlFor={id} className="text-sm text-soft">{d.play.calc.perDay}</label>
      </div>
      <div className="relative mt-3">
        <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-ink/10" />
        <div
          aria-hidden="true"
          className="absolute top-1/2 h-2 w-full rounded-full bg-red origin-left rtl:origin-right transition-transform duration-150"
          style={{ transform: `translateY(-50%) scaleX(${pct / 100})` }}
        />
        <input
          id={id}
          type="range"
          min={MIN}
          max={MAX}
          step={1}
          value={perDay}
          onChange={(e) => setPerDay(Number(e.target.value))}
          className="range-wakil relative block w-full"
        />
      </div>
      <dl className="mt-5 grid grid-cols-2 gap-3">
        <div className="flex flex-col-reverse rounded-xl bg-slip p-3">
          <dt className="text-xs text-soft">{d.play.calc.perMonth}</dt>
          <dd className="text-2xl font-extrabold text-blue"><CountUp to={perMonth} duration={0.45} format={fmt} /></dd>
        </div>
        <div className="flex flex-col-reverse rounded-xl bg-slip p-3">
          <dt className="text-xs text-soft">{d.play.calc.hours}</dt>
          <dd className="text-2xl font-extrabold text-red">≈ <CountUp to={hours} duration={0.45} format={fmt} /></dd>
        </div>
      </dl>
      <p className="mt-3 text-[0.7rem] text-soft">{d.play.calc.note}</p>
    </div>
  );
}
