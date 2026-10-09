import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Modal as HeroModal } from "@heroui/react";
import { dur, useMotionSafe } from "../lib/motion";

// Shared dialog. HeroUI Modal handles focus trap, Escape and the backdrop; the parent unmounts it
// only after the exit animation (open flips to false first, then onClose runs).
export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const reduced = useMotionSafe();
  const [open, setOpen] = useState(true);
  const timer = useRef<number | undefined>(undefined);

  const dismiss = useCallback((next: boolean) => {
    if (next) return;
    setOpen(false);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(onClose, reduced ? 0 : dur.short * 1000);
  }, [onClose, reduced]);

  return (
    <HeroModal isOpen={open} onOpenChange={dismiss}>
      <HeroModal.Backdrop className="bg-ink/45 backdrop-blur-[2px]">
        <HeroModal.Container>
          <HeroModal.Dialog aria-label={title} className="rounded-wakil-lg border-2 border-ink bg-slip shadow-ink sm:max-w-[640px]">
            <HeroModal.CloseTrigger aria-label="Close" />
            <HeroModal.Header className="ps-10 pe-10">
              <HeroModal.Heading className="text-lg font-extrabold text-ink">{title}</HeroModal.Heading>
            </HeroModal.Header>
            <HeroModal.Body>{children}</HeroModal.Body>
          </HeroModal.Dialog>
        </HeroModal.Container>
      </HeroModal.Backdrop>
    </HeroModal>
  );
}
