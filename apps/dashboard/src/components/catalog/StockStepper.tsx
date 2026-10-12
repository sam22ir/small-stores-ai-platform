import { useEffect, useRef, useState } from "react";
import { AnimatePresence, m } from "motion/react";
import { Button } from "@heroui/react";
import { useI18n } from "../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../lib/motion";
import type { Variant } from "../../lib/catalog";

// Stock number with a tick when it changes and a check that flashes after a saved change.
export function StockStepper({ v, onStep }: { v: Variant; onStep: (delta: number) => Promise<boolean> }) {
  const { t } = useI18n();
  const reduced = useMotionSafe();
  const [saved, setSaved] = useState(false);
  const timer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  async function step(delta: number) {
    const ok = await onStep(delta);
    if (!ok) return;
    setSaved(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSaved(false), 1200);
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <Button isIconOnly variant="outline" size="sm" className="size-11 min-h-11 min-w-11 rounded-full" aria-label={t("catalog.decrease")} onPress={() => void step(-1)}>−</Button>
      <span className="relative min-w-10 text-center" aria-live="polite">
        <AnimatePresence initial={false} mode="popLayout">
          <m.span
            key={v.stock_quantity}
            className="block font-semibold text-[15px] tabular-nums"
            initial={reduced ? false : { y: -8, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reduced ? undefined : { y: 8, opacity: 0, position: "absolute", inset: 0 }}
            transition={{ duration: dur.micro, ease: ease.out }}
          >
            {v.stock_quantity}
          </m.span>
        </AnimatePresence>
      </span>
      <AnimatePresence>
        {saved && (
          <m.span key="saved" aria-hidden="true" className="text-success text-sm font-bold"
            initial={reduced ? false : { scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: dur.short, ease: ease.stamp }}>✓</m.span>
        )}
      </AnimatePresence>
      <Button isIconOnly variant="outline" size="sm" className="size-11 min-h-11 min-w-11 rounded-full" aria-label={t("catalog.increase")} onPress={() => void step(1)}>+</Button>
    </div>
  );
}
