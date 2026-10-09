// Shared motion tokens. Animate only transform and opacity (cheap on low-end Android).
// Every animated component reads useMotionSafe(): when the visitor asks for reduced motion,
// elements render in their final state and no timers run.
import { useReducedMotion } from "motion/react";

export const ease = {
  out: [0.2, 0.7, 0.2, 1] as const,
  inOut: [0.65, 0, 0.35, 1] as const,
  stamp: [0.34, 1.56, 0.64, 1] as const,
};

export const dur = {
  micro: 0.15,
  short: 0.3,
  base: 0.55,
  slow: 0.9,
};

// True when motion should be skipped. Defaults to false while the media query is unknown.
export function useMotionSafe(): boolean {
  return useReducedMotion() === true;
}

// Picks the animated value unless reduced motion is on.
export function pick<T>(reduced: boolean, full: T, still: T): T {
  return reduced ? still : full;
}
