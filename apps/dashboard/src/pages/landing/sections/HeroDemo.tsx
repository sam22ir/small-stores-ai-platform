// Hero figure: a DM exchange that turns into an order slip. Tapping a line on the slip lights up the
// words in the chat it came from, so a visitor sees Wakil read the order out of the conversation.
// After the intro it walks through the lines once by itself, until the visitor taps anything.
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { useLandingCopy } from "../../../lib/i18n";
import { dur, ease, useMotionSafe } from "../../../lib/motion";
import { DmBubble } from "../../../components/wakil/DmBubble";
import { OrderSlip } from "../../../components/wakil/OrderSlip";
import { useReplay } from "../../../components/wakil/Interact";
import { ReplayIcon, TapIcon, Typing } from "./bits";

// The chat, split so each value on the slip points at the words it came from.
type Seg = { t: string; k?: string[] };
const ASK: Seg[] = [{ t: "Salam, kayen l'" }, { t: "hoodie noir taille M", k: ["item", "total"] }, { t: "? chhal?" }];
const REPLY: Seg[] = [
  { t: "Wa alaykum salam! Ih kayen, noir M b " },
  { t: "3,200 DA", k: ["item", "total"] },
  { t: ". Livraison l " },
  { t: "Oran", k: ["wilaya"] },
  { t: " " },
  { t: "400 DA", k: ["delivery", "total"] },
  { t: ". Nsajlek commande?" },
];
const TOUR = ["item", "wilaya", "delivery", "total"];

function Segs({ segs, active, tone }: { segs: Seg[]; active: string | null; tone: string }) {
  return (
    <>
      {segs.map((s, i) => {
        const on = !!(active && s.k?.includes(active));
        return s.k ? (
          <mark
            key={i}
            className={`-mx-0.5 rounded px-0.5 [box-decoration-break:clone] transition-[background-color,color,box-shadow] duration-300 ${
              on ? tone : "bg-transparent text-inherit"
            }`}
          >
            {s.t}
          </mark>
        ) : (
          <span key={i}>{s.t}</span>
        );
      })}
    </>
  );
}

function Exchange({ onDone }: { onDone: () => void }) {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [active, setActive] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState(reduced ? 2 : 0); // 0 asked, 1 typing, 2 replied
  const done = useRef(onDone);
  done.current = onDone;

  useEffect(() => {
    if (reduced) return;
    const a = window.setTimeout(() => setPhase(1), 700);
    const b = window.setTimeout(() => setPhase(2), 1700);
    return () => [a, b].forEach(window.clearTimeout);
  }, [reduced]);

  // One guided walk through the slip lines after it lands, unless the visitor already tapped.
  useEffect(() => {
    if (reduced || touched) return;
    const ids: number[] = [];
    TOUR.forEach((k, i) => ids.push(window.setTimeout(() => setActive(k), 4200 + i * 1100)));
    ids.push(window.setTimeout(() => { setActive(null); done.current(); }, 4200 + TOUR.length * 1100));
    return () => ids.forEach(window.clearTimeout);
  }, [reduced, touched]);

  const trace = (k: string | null) => {
    setTouched(true);
    setActive(k);
  };

  return (
    <>
      <div className="min-h-[9.5rem] space-y-3" dir="ltr">
        <DmBubble variant="in" animate delay={0.2}>
          <Segs segs={ASK} active={active} tone="bg-red/15 text-ink shadow-[0_0_0_2px] shadow-red/30" />
        </DmBubble>
        {phase === 1 && <Typing />}
        {phase === 2 && (
          <DmBubble variant="out" animate>
            <Segs segs={REPLY} active={active} tone="bg-slip text-blue shadow-[0_0_0_2px] shadow-slip/40" />
          </DmBubble>
        )}
      </div>
      <div className="mt-8">
        <OrderSlip
          intro
          delay={reduced ? 0 : 2.3}
          title={d.slip.title}
          sub={d.slip.sub}
          rows={[
            { label: d.slip.client, value: "Amina B." },
            { label: d.slip.phone, value: "0555 •• •• 21", ltr: true },
            { label: d.slip.wilaya, value: d.slip.wilayaValue, trace: "wilaya" },
            { label: d.slip.item, value: d.slip.itemValue, trace: "item" },
            { label: d.slip.delivery, value: "400 DA", trace: "delivery" },
          ]}
          total={{ label: d.slip.total, value: "3,600 DA", trace: "total" }}
          stamp={d.slip.stamp}
          trail={d.slip.trail}
          active={active}
          onTrace={trace}
          traceLabel={d.play.traceShow}
        />
      </div>
    </>
  );
}

export function HeroDemo() {
  const d = useLandingCopy();
  const reduced = useMotionSafe();
  const [k, replay] = useReplay();
  const [toured, setToured] = useState(false);

  return (
    <figure className="relative mx-auto w-full max-w-md">
      <Exchange key={k} onDone={() => setToured(true)} />
      <figcaption className="mt-10 flex flex-col items-center gap-3 text-center text-xs text-soft">
        <span className="inline-flex items-center gap-1.5">
          <motion.span
            className="inline-flex text-blue"
            animate={reduced || toured ? undefined : { y: [0, -3, 0] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: ease.inOut }}
          >
            <TapIcon className="size-4" />
          </motion.span>
          {d.play.traceHint}
        </span>
        <span className="flex items-center gap-3">
          <span>{d.hero.slipCaption}</span>
          <motion.button
            type="button"
            onClick={() => { setToured(false); replay(); }}
            className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-slip px-2.5 py-1 font-semibold text-ink transition-colors hover:border-blue hover:text-blue focus-visible:outline-2 focus-visible:outline-blue"
            whileHover={reduced ? undefined : { scale: 1.04 }}
            whileTap={reduced ? undefined : { scale: 0.94 }}
            transition={{ duration: dur.micro }}
          >
            <motion.span className="inline-flex" whileHover={reduced ? undefined : { rotate: -200 }} transition={{ duration: dur.base, ease: ease.out }}>
              <ReplayIcon className="size-3.5" />
            </motion.span>
            {d.play.replay}
          </motion.button>
        </span>
      </figcaption>
    </figure>
  );
}
