import { motion } from "motion/react";
import { Stamp } from "./Stamp";
import { dur, ease, useMotionSafe } from "../../lib/motion";

export interface SlipRow {
  label: string;
  value: string;
  ltr?: boolean;
}

// Zig-zag (torn) bottom edge, as a clip-path polygon.
function tornBottom(teeth = 14, depth = 6) {
  const pts = ["0% 0%", "100% 0%", `100% calc(100% - ${depth}px)`];
  for (let i = 0; i < teeth; i++) {
    const x = 100 - ((i + 1) / teeth) * 100;
    const y = i % 2 === 0 ? "100%" : `calc(100% - ${depth}px)`;
    pts.push(`${x.toFixed(2)}% ${y}`);
  }
  pts.push(`0% calc(100% - ${depth}px)`);
  return `polygon(${pts.join(", ")})`;
}

// A printed order slip. With `intro` it slides in, then the stamp slams down.
export function OrderSlip({
  title,
  sub,
  rows,
  total,
  stamp,
  trail,
  intro = false,
  delay = 0.5,
  className = "",
}: {
  title: string;
  sub?: string;
  rows: SlipRow[];
  total: SlipRow;
  stamp?: string;
  trail?: string;
  intro?: boolean;
  delay?: number;
  className?: string;
}) {
  const reduced = useMotionSafe();
  const animateIntro = intro && !reduced;
  return (
    <div className={`relative ${className}`}>
      <motion.div
        className="relative bg-slip px-5 pt-5 pb-8 text-ink shadow-paper"
        style={{ clipPath: tornBottom() }}
        initial={animateIntro ? { opacity: 0, y: -40, rotate: -4 } : false}
        animate={{ opacity: 1, y: 0, rotate: 2 }}
        transition={{ duration: dur.slow, ease: ease.out, delay }}
      >
        <p lang="ar" className="text-lg font-extrabold">{title}</p>
        {sub && <p className="mt-0.5 text-xs text-soft">{sub}</p>}
        <dl className="mt-4 space-y-2 text-sm">
          {rows.map((r) => (
            <div key={r.label} className="flex justify-between gap-4 border-b border-dashed border-ink/20 pb-1.5">
              <dt className="text-soft">{r.label}</dt>
              <dd dir={r.ltr ? "ltr" : undefined} className="font-semibold tabular-nums">{r.value}</dd>
            </div>
          ))}
          <div className="flex justify-between gap-4 pt-1 text-base">
            <dt className="font-bold">{total.label}</dt>
            <dd className="font-extrabold tabular-nums text-blue">{total.value}</dd>
          </div>
        </dl>
        {trail && <p className="mt-5 text-[0.7rem] leading-relaxed text-soft">{trail}</p>}
      </motion.div>
      {stamp && (
        <div className="absolute end-4 bottom-6 -rotate-3">
          <Stamp intro={intro} delay={animateIntro ? delay + 1.1 : 0}>{stamp}</Stamp>
        </div>
      )}
    </div>
  );
}
