import React, { useEffect, useState } from "react";
import styles from "./styles/boot-splash.module.scss";

const ANIMATED_MS = 1400;
const STATIC_MS = 500;
const LIFT_MS = 300;
/** Never hold the app longer than this, even if the connection is slow. */
const MAX_WAIT_MS = 6000;

// Shown once per page load, not on every screen change
let alreadyShown = false;

function prefersReducedMotion(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  if (root.getAttribute("data-reduced-motion") === "reduce") return true;
  return Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
}

/** Opening screen: the two rings of the mark converge, the name appears, then the screen lifts. */
export const BootSplash: React.FC<{ ready?: boolean }> = ({ ready = true }) => {
  const [visible, setVisible] = useState(!alreadyShown);
  const [reduced] = useState(prefersReducedMotion);
  const [minElapsed, setMinElapsed] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Lock scroll while the bootstrap splash is visible until it completely disappears
  useEffect(() => {
    if (!visible) return;
    const root = document.documentElement;
    const body = document.body;
    const prevRootOverflow = root.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    root.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      root.style.overflow = prevRootOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, [visible]);

  // Plays for its full length, and stays until the app is ready (session connected)
  useEffect(() => {
    if (!visible) return;
    alreadyShown = true;
    const min = setTimeout(() => setMinElapsed(true), reduced ? STATIC_MS : ANIMATED_MS);
    const cap = setTimeout(() => setLeaving(true), MAX_WAIT_MS);
    return () => {
      clearTimeout(min);
      clearTimeout(cap);
    };
  }, [visible, reduced]);

  useEffect(() => {
    if (minElapsed && ready) setLeaving(true);
  }, [minElapsed, ready]);

  // Lift away smoothly, then remove
  useEffect(() => {
    if (!leaving) return;
    const done = setTimeout(() => setVisible(false), reduced ? 0 : LIFT_MS);
    return () => clearTimeout(done);
  }, [leaving, reduced]);

  if (!visible) return null;

  return (
    <div className={`${styles.splash} ${reduced ? styles.still : ""} ${leaving ? styles.lifting : ""}`} role="presentation" aria-hidden>
      <div className={styles.center}>
        <svg className={styles.mark} viewBox="0 0 64 64">
          <g className={styles.left}>
            <circle cx="22" cy="32" r="14" fill="none" stroke="var(--boot-text)" strokeWidth="6" />
          </g>
          <g className={styles.right}>
            <circle cx="42" cy="32" r="14" fill="none" stroke="var(--boot-accent)" strokeWidth="6" />
          </g>
        </svg>
        <span className={styles.word}>OMIOROOM</span>
      </div>
    </div>
  );
};
