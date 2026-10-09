import { motion } from "motion/react";
import { dur, ease, useMotionSafe } from "../../lib/motion";

// Scroll-in wrapper: fades and lifts its children once, when they first enter the viewport.
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const reduced = useMotionSafe();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: dur.base, ease: ease.out, delay }}
    >
      {children}
    </motion.div>
  );
}
