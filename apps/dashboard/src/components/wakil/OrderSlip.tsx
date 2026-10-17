import { motion } from "motion/react";
import { Stamp } from "./Stamp";
import { dur, ease, useMotionSafe } from "../../lib/motion";

export interface SlipRow {
  label: string;
  value: string;
  ltr?: boolean;
  // When set, the row is tappable: it reports this key so the page can highlight its source in the chat.
  trace?: string;
}

// One row. A traced row gets a full-row button (the dl keeps its dt/dd structure) and a marker when active.
function Row({ r, active, onTrace, traceLabel, big = false }: { r: SlipRow; active: boolean; onTrace?: (k: string | null) => void; traceLabel?: string; big?: boolean }) {
  const reduced = useMotionSafe();
  const tappable = !!(r.trace && onTrace);
  return (
    <div
      className={`group relative flex justify-between gap-4 ${big ? "pt-1 text-base" : "border-b border-dashed border-ink/20 pb-1.5"} ${
        tappable ? "cursor-pointer" : ""
      }`}
    >
      {tappable && (
        <motion.span
          aria-hidden="true"
          className="absolute -inset-x-2 -inset-y-1 rounded-md bg-blue/10 origin-left rtl:origin-right"
          initial={false}
          animate={{ opacity: active ? 1 : 0, scaleX: active || reduced ? 1 : 0.6 }}
          transition={{ duration: dur.short, ease: ease.out }}
        />
      )}
      <dt className={`relative ${big ? "font-bold" : "text-soft"}`}>
        {r.label}
        {tappable && (
          <span aria-hidden="true" className="ms-1.5 inline-block size-1.5 -translate-y-0.5 rounded-full bg-blue/50 transition-transform duration-200 group-hover:scale-150" />
        )}
      </dt>
      <dd dir={r.ltr ? "ltr" : "auto"} className={`relative tabular-nums ${big ? "font-extrabold text-blue" : "font-semibold"}`}>
        {r.value}
      </dd>
      {tappable && (
        <button
          type="button"
          aria-pressed={active}
          aria-label={`${traceLabel ?? ""} ${r.label}`.trim()}
          className="absolute -inset-x-2 -inset-y-1 rounded-md focus-visible:outline-2 focus-visible:outline-blue"
          onClick={() => onTrace!(r.trace!)}
          onPointerEnter={(e) => e.pointerType === "mouse" && onTrace!(r.trace!)}
          onPointerLeave={(e) => e.pointerType === "mouse" && onTrace!(null)}
        />
      )}
    </div>
  );
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
  active = null,
  onTrace,
  traceLabel,
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
  active?: string | null;
  onTrace?: (k: string | null) => void;
  traceLabel?: string;
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
            <Row key={r.label} r={r} active={!!r.trace && active === r.trace} onTrace={onTrace} traceLabel={traceLabel} />
          ))}
          <Row r={total} big active={!!total.trace && active === total.trace} onTrace={onTrace} traceLabel={traceLabel} />
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
