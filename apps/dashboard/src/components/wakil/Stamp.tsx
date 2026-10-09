import { motion } from "motion/react";
import { dur, ease, pick, useMotionSafe } from "../../lib/motion";

// Rubber stamp. With `intro`, it slams down (scale + rotate) after `delay`; it wobbles on hover.
export function Stamp({
  children,
  className = "",
  intro = false,
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  intro?: boolean;
  delay?: number;
}) {
  const reduced = useMotionSafe();
  const animateIntro = intro && !reduced;
  return (
    <motion.span
      className={`inline-block border-[2.5px] border-red px-2.5 py-1 text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-red mix-blend-multiply ${className}`}
      initial={animateIntro ? { opacity: 0, scale: 2.4, rotate: -14 } : false}
      animate={{ opacity: 1, scale: 1, rotate: -7 }}
      transition={{ duration: dur.short, ease: ease.stamp, delay }}
      whileHover={pick(reduced, { rotate: [-7, -4, -9, -7] }, {})}
    >
      {children}
    </motion.span>
  );
}
