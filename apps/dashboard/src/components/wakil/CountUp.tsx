import { useEffect, useRef, useState } from "react";
import { animate, useInView } from "motion/react";
import { ease, useMotionSafe } from "../../lib/motion";

// Counts a number up to `to`. With `viewOnce`, it counts when first scrolled into view.
// Reduced motion shows the final value straight away.
export function CountUp({
  to,
  format = (n: number) => String(Math.round(n)),
  viewOnce = false,
  duration = 0.9,
  className = "",
}: {
  to: number;
  format?: (n: number) => string;
  viewOnce?: boolean;
  duration?: number;
  className?: string;
}) {
  const reduced = useMotionSafe();
  const ref = useRef<HTMLSpanElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.6 });
  const active = viewOnce ? seen : true;
  const target = active ? to : 0;

  const [shown, setShown] = useState(target);
  const shownRef = useRef(target);

  useEffect(() => {
    if (reduced || shownRef.current === target) return;
    const controls = animate(shownRef.current, target, {
      duration,
      ease: ease.out,
      onUpdate: (v) => {
        shownRef.current = v;
        setShown(v);
      },
    });
    return () => controls.stop();
  }, [target, duration, reduced]);

  const value = reduced ? to : shown;
  return (
    <span ref={ref} className={`tabular-nums ${className}`}>
      {format(value)}
    </span>
  );
}
