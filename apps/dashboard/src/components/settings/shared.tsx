import { AnimatePresence, m } from "motion/react";
import { useMotionSafe, dur, ease } from "../../lib/motion";

// Card and heading classes shared by every Settings card.
export const CARD = "flex flex-col gap-4 rounded-wakil-lg border-2 border-ink bg-slip p-5 shadow-ink-sm";
export const SECTION_TITLE = "m-0 text-[15px] font-extrabold text-ink";

// Inline "saved" check that pops in beside a save button.
export function SavedCheck({ show, label }: { show: boolean; label: string }) {
  const reduced = useMotionSafe();
  return (
    <AnimatePresence>
      {show && (
        <m.span key="ok" role="status" className="inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-slip px-3 py-1 text-sm font-bold text-ink"
          initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: dur.short, ease: ease.stamp }}>
          <span aria-hidden="true" className="text-success">✓</span>{label}
        </m.span>
      )}
    </AnimatePresence>
  );
}
