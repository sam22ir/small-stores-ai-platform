import { motion } from "motion/react";
import { dur, ease, useMotionSafe } from "../../lib/motion";

export type DmVariant = "in" | "out" | "note";

// Chat bubble. "in" is the customer, "out" is Wakil, "note" is a handoff or tool note.
export function DmBubble({
  variant,
  children,
  lang,
  delay = 0,
  animate = false,
  className = "",
}: {
  variant: DmVariant;
  children: React.ReactNode;
  lang?: string;
  delay?: number;
  animate?: boolean;
  className?: string;
}) {
  const reduced = useMotionSafe();
  const variantClass =
    variant === "in"
      ? "bg-slip text-ink border border-ink/15 rounded-2xl rounded-es-sm"
      : variant === "out"
        ? "bg-blue text-slip rounded-2xl rounded-ee-sm ms-auto"
        : "bg-transparent text-soft border border-dashed border-soft/60 rounded-xl text-sm";
  const x = variant === "in" ? -12 : 12;
  return (
    <motion.div
      lang={lang}
      dir={lang === "ar" ? "rtl" : undefined}
      className={`max-w-[85%] px-3.5 py-2.5 text-[0.95rem] leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] ${variantClass} ${className}`}
      initial={animate && !reduced ? { opacity: 0, y: 8, x } : false}
      animate={{ opacity: 1, y: 0, x: 0 }}
      transition={{ duration: dur.short, ease: ease.out, delay }}
    >
      {children}
    </motion.div>
  );
}
