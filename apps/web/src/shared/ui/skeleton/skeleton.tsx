import React from "react";
import styles from "./skeleton.module.scss";

export interface SkeletonProps {
  /** If false, children are rendered instead of the placeholder skeleton */
  loading?: boolean;
  width?: number | string;
  height?: number | string;
  /** "circle" makes it round; "text" uses text line dimensions; "block" is a box */
  shape?: "block" | "text" | "circle";
  className?: string;
  children?: React.ReactNode;
}

/** Placeholder shown while content loads. Decorative, hidden from assistive tech when loading. */
export const Skeleton: React.FC<SkeletonProps> = ({
  loading = true,
  width = "100%",
  height,
  shape = "block",
  className,
  children,
}) => {
  if (!loading) {
    return children !== undefined ? <>{children}</> : null;
  }

  const computedWidth = shape === "circle" ? (width ?? height ?? 40) : width;
  const computedHeight =
    height ?? (shape === "text" ? 14 : shape === "circle" ? computedWidth : undefined);
  const customVars: React.CSSProperties = {
    "--skeleton-width": typeof computedWidth === "number" ? `${computedWidth}px` : computedWidth,
    ...(computedHeight !== undefined
      ? { "--skeleton-height": typeof computedHeight === "number" ? `${computedHeight}px` : computedHeight }
      : {}),
  } as React.CSSProperties;

  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${styles[shape]} ${className ?? ""}`}
      style={customVars}
    />
  );
};
