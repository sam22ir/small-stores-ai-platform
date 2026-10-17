// Shared sample data, icons and small pieces for the landing sections.
import { motion } from "motion/react";
import { ease, useMotionSafe } from "../../../lib/motion";

// Example delivery fees used everywhere on the page, so the hero, chats, demo and tiles agree.
export const WILAYAS = [
  { name: "Alger", fee: 350 },
  { name: "Oran", fee: 400 },
  { name: "Sétif", fee: 450 },
  { name: "Constantine", fee: 450 },
  { name: "Annaba", fee: 500 },
];

// Three bouncing dots: Wakil is typing.
export function Typing({ label, tone = "bg-blue/10", dot = "bg-blue" }: { label?: string; tone?: string; dot?: string }) {
  const reduced = useMotionSafe();
  return (
    <div
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`ms-auto flex w-fit items-center gap-1.5 rounded-2xl rounded-ee-sm px-3.5 py-3 ${tone}`}
    >
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className={`size-1.5 rounded-full ${dot}`}
          animate={reduced ? undefined : { y: [0, -4, 0] }}
          transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.12, ease: ease.inOut }}
        />
      ))}
    </div>
  );
}

function Svg({ children, className = "size-4" }: { children: React.ReactNode; className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const ReplayIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></Svg>
);
export const CheckIcon = ({ className }: { className?: string }) => <Svg className={className}><path d="M20 6 9 17l-5-5" /></Svg>;
export const BellIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0" /></Svg>
);
export const PasteIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /></Svg>
);
export const TapIcon = ({ className }: { className?: string }) => (
  <Svg className={className}><path d="M9 11V5a2 2 0 0 1 4 0v6" /><path d="M13 9a2 2 0 0 1 4 0v2a2 2 0 0 1 4 0v3a7 7 0 0 1-7 7h-1a7 7 0 0 1-6-3.4L4.5 14a2 2 0 0 1 3.4-2L9 13.5" /></Svg>
);
