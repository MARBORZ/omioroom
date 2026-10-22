import React from "react";
import styles from "./skeleton.module.scss";

interface SkeletonProps {
  width?: number | string;
  height?: number | string;
  /** "circle" makes it round; "text" uses a line height. */
  shape?: "block" | "text" | "circle";
  className?: string;
}

/** Placeholder shown while content loads. Decorative, hidden from assistive tech. */
export const Skeleton: React.FC<SkeletonProps> = ({ width = "100%", height, shape = "block", className }) => (
  <span
    aria-hidden
    className={`${styles.skeleton} ${styles[shape]} ${className ?? ""}`}
    style={{ width, height: height ?? (shape === "text" ? 14 : undefined) }}
  />
);
