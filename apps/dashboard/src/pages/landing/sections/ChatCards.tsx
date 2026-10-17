// Sample chats. Each card plays its exchange (question, typing, reply) when it scrolls into view,
// and plays again on tap. A chip names the language Wakil answered in.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView } from "motion/react";
import { Chip } from "@heroui/react";
import { useLandingCopy } from "../../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../../lib/motion";
import { DmBubble } from "../../../components/wakil/DmBubble";
import { Spotlight } from "../../../components/wakil/Interact";
import type { LandingChat } from "../../../lib/locales/landing/types";
import { ReplayIcon, Typing } from "./bits";

function ChatCard({ c, lang, i }: { c: LandingChat; lang: string; i: number }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const ref = useRef<HTMLDivElement>(null);
  const seen = useInView(ref, { once: true, amount: 0.5 });
  const [run, setRun] = useState(0);
  const [phase, setPhase] = useState(reduced ? 3 : 0); // 0 empty, 1 asked, 2 typing, 3 replied

  useEffect(() => {
    if (reduced || !seen) return;
    setPhase(0);
    const t = [
      window.setTimeout(() => setPhase(1), 150 + i * 250),
      window.setTimeout(() => setPhase(2), 750 + i * 250),
      window.setTimeout(() => setPhase(3), 1700 + i * 250),
    ];
    return () => t.forEach(window.clearTimeout);
    // `run` replays the exchange; the stagger only matters on the first pass.
  }, [seen, run, reduced, i]);

  const replay = () => setRun((n) => n + 1);

  return (
    <motion.div
      ref={ref}
      onClick={replay}
      className="group relative flex h-full cursor-pointer flex-col rounded-2xl border border-ink/10 bg-slip p-4 shadow-paper"
      whileHover={reduced ? undefined : { y: -4 }}
      whileTap={reduced ? undefined : { scale: 0.98 }}
      transition={{ duration: dur.short, ease: ease.out }}
    >
      <Spotlight tone="bg-blue/10" />
      <div className="relative flex items-center justify-between gap-2">
        <Chip size="sm" className="bg-blue/10 text-blue">{lang}</Chip>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); replay(); }}
          aria-label={`${d.play.replay}: ${lang}`}
          className="rounded-full p-1.5 text-soft transition-colors hover:bg-ink/5 hover:text-blue focus-visible:outline-2 focus-visible:outline-blue"
        >
          <motion.span className="inline-flex" initial={false} animate={{ rotate: reduced ? 0 : -360 * run }} transition={{ duration: dur.base, ease: ease.out }}>
            <ReplayIcon className="size-4" />
          </motion.span>
        </button>
      </div>
      <div className="relative mt-3 min-h-[8.5rem] space-y-2.5" aria-live="polite">
        <AnimatePresence initial={false}>
          {phase >= 1 && (
            <DmBubble key={`q${run}`} variant="in" lang={c.customerLang} animate>{c.customer}</DmBubble>
          )}
          {phase === 2 && (
            <motion.div key={`t${run}`} exit={{ opacity: 0 }} transition={{ duration: dur.micro }}>
              <Typing />
            </motion.div>
          )}
          {phase === 3 && (
            <DmBubble key={`r${run}`} variant="out" lang={c.replyLang} animate>{c.reply}</DmBubble>
          )}
        </AnimatePresence>
      </div>
      {c.tag && (
        <motion.div
          className="relative mt-4"
          initial={false}
          animate={{ opacity: phase === 3 ? 1 : 0, y: phase === 3 || reduced ? 0 : 6 }}
          transition={{ duration: dur.short, ease: ease.out, delay: phase === 3 ? 0.25 : 0 }}
        >
          <Chip className="bg-red/10 text-red" size="sm">{c.tag}</Chip>
        </motion.div>
      )}
    </motion.div>
  );
}

export function ChatCards() {
  const d = useLandingCopy();
  return (
    <>
      <ul className="mt-10 grid gap-5 md:grid-cols-3" role="list">
        {d.chats.items.map((c, i) => (
          <li key={i}>
            <ChatCard c={c} lang={d.demo.tabs[i] ?? ""} i={i} />
          </li>
        ))}
      </ul>
      <p className="mt-4 text-center text-xs text-soft">{d.play.chatsHint}</p>
    </>
  );
}
