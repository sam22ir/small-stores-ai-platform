// Micro-interaction primitives for the landing page.
// Hover effects (magnetic pull, spotlight) only run on a fine pointer that can hover: on phones they
// render nothing extra, so every section keeps a tap interaction of its own. All motion is transform
// and opacity, and nothing moves under reduced motion.
import { useEffect, useRef, useState } from "react";
import { motion, useMotionValue, useSpring } from "motion/react";
import { dur, ease, useMotionSafe } from "../../lib/motion";

const FINE = "(hover: hover) and (pointer: fine)";

// True on a mouse or trackpad. False on touch screens and before the first effect runs.
export function useFinePointer(): boolean {
  const [fine, setFine] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(FINE);
    const on = () => setFine(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return fine;
}

// Pulls its child a few pixels toward the cursor, then springs back when the cursor leaves.
// `className` replaces the default display class, so callers can pass e.g. "hidden sm:inline-flex".
export function Magnetic({ children, strength = 0.25, className = "inline-flex" }: { children: React.ReactNode; strength?: number; className?: string }) {
  const reduced = useMotionSafe();
  const fine = useFinePointer();
  const x = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 });
  const y = useSpring(useMotionValue(0), { stiffness: 260, damping: 18 });
  const live = fine && !reduced;

  return (
    <motion.div
      className={className}
      style={live ? { x, y } : undefined}
      onPointerMove={(e) => {
        if (!live) return;
        const r = e.currentTarget.getBoundingClientRect();
        x.set((e.clientX - r.left - r.width / 2) * strength);
        y.set((e.clientY - r.top - r.height / 2) * strength);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {children}
    </motion.div>
  );
}

// A soft glow that follows the cursor inside a card. The glow is a blurred disc moved with transform,
// so the browser does not repaint a gradient on every mouse move.
export function Spotlight({ className = "", tone = "bg-blue/15", size = 220 }: { className?: string; tone?: string; size?: number }) {
  const reduced = useMotionSafe();
  const fine = useFinePointer();
  const ref = useRef<HTMLDivElement>(null);
  const x = useSpring(useMotionValue(-999), { stiffness: 300, damping: 30 });
  const y = useSpring(useMotionValue(-999), { stiffness: 300, damping: 30 });
  const [on, setOn] = useState(false);

  useEffect(() => {
    const host = ref.current?.parentElement;
    if (!host || !fine || reduced) return;
    const move = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      x.set(e.clientX - r.left - size / 2);
      y.set(e.clientY - r.top - size / 2);
    };
    const enter = () => setOn(true);
    const leave = () => setOn(false);
    host.addEventListener("pointermove", move);
    host.addEventListener("pointerenter", enter);
    host.addEventListener("pointerleave", leave);
    return () => {
      host.removeEventListener("pointermove", move);
      host.removeEventListener("pointerenter", enter);
      host.removeEventListener("pointerleave", leave);
    };
  }, [fine, reduced, size, x, y]);

  if (!fine || reduced) return null;
  return (
    <div ref={ref} aria-hidden="true" className={`pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] ${className}`}>
      <motion.div
        className={`absolute top-0 left-0 rounded-full blur-2xl ${tone}`}
        style={{ x, y, width: size, height: size }}
        animate={{ opacity: on ? 1 : 0 }}
        transition={{ duration: dur.short, ease: ease.out }}
      />
    </div>
  );
}

// An on/off switch with a springy thumb. Keyboard and screen readers see a real switch.
export function Toggle({
  on,
  onChange,
  label,
  tone = "bg-blue",
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  label: string;
  tone?: string;
}) {
  const reduced = useMotionSafe();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${
        on ? tone : "bg-ink/20"
      } ${on ? "justify-end" : "justify-start"}`}
    >
      <motion.span layout={!reduced} transition={{ type: "spring", stiffness: 500, damping: 30 }} className="block size-5 rounded-full bg-slip shadow-sm" />
    </button>
  );
}

// Plays children again from the start: bumping `k` remounts them.
export function useReplay(): [number, () => void] {
  const [k, setK] = useState(0);
  return [k, () => setK((n) => n + 1)];
}
