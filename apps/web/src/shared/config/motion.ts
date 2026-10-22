/**
 * Single source of truth for motion. Components never hardcode durations or curves:
 * CSS reads the variables below, JS reads MOTION directly.
 */
export const MOTION = {
  duration: { instant: 90, fast: 180, base: 260, slow: 420 },
  easing: {
    /** Apple fluid decelerating curve, default for natural screen and panel entries. */
    out: "cubic-bezier(0.16, 1, 0.3, 1)",
    inOut: "cubic-bezier(0.65, 0, 0.35, 1)",
    /** Apple spring overshoot for toggles, chips and button confirmations. */
    spring: "cubic-bezier(0.34, 1.35, 0.64, 1)",
    bounce: "cubic-bezier(0.34, 1.35, 0.64, 1)",
    /** Apple snappy interactive curve for modal popups and sheets. */
    apple: "cubic-bezier(0.16, 1, 0.3, 1)",
    exit: "cubic-bezier(0.4, 0, 1, 1)",
  },
  /** How far elements travel when they rise in. */
  riseDistance: 8,
  /** Delay between siblings in a staggered list. */
  stagger: 35,
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
  root.style.setProperty("--ease-bounce", easing.bounce);
  root.style.setProperty("--ease-apple", easing.apple);
  root.style.setProperty("--ease-exit", easing.exit);
  root.style.setProperty("--rise", `${MOTION.riseDistance}px`);
  root.style.setProperty("--stagger", `${MOTION.stagger}ms`);
}
