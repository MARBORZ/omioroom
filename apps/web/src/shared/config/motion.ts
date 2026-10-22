/**
 * Single source of truth for motion. Components never hardcode durations or curves:
 * CSS reads the variables below, JS reads MOTION directly.
 */
export const MOTION = {
  duration: { instant: 90, fast: 160, base: 240, slow: 380 },
  easing: {
    /** Decelerating, the default for things entering the screen. */
    out: "cubic-bezier(0.22, 1, 0.36, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    /** Slight overshoot for small confirmations (press, toggle). */
    spring: "cubic-bezier(0.34, 1.4, 0.64, 1)",
  },
  /** How far elements travel when they rise in. */
  riseDistance: 10,
  /** Delay between siblings in a staggered list. */
  stagger: 40,
} as const;

/** Publishes the config as CSS custom properties (called once at startup). */
export function applyMotionTokens(root: HTMLElement = document.documentElement): void {
  const { duration, easing } = MOTION;
  root.style.setProperty("--motion-instant", `${duration.instant}ms`);
  root.style.setProperty("--motion-fast", `${duration.fast}ms`);
  root.style.setProperty("--motion-base", `${duration.base}ms`);
  root.style.setProperty("--motion-slow", `${duration.slow}ms`);
  root.style.setProperty("--ease-out", easing.out);
  root.style.setProperty("--ease-in-out", easing.inOut);
  root.style.setProperty("--ease-spring", easing.spring);
  root.style.setProperty("--rise", `${MOTION.riseDistance}px`);
  root.style.setProperty("--stagger", `${MOTION.stagger}ms`);
}
