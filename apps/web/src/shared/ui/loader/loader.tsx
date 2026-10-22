import React from "react";
import styles from "./loader.module.scss";

export interface LoaderProps {
  /** If false, children are rendered instead of the loader */
  loading?: boolean;
  size?: "sm" | "md" | "lg";
  label?: string;
  /** Whether the text label is visibly rendered next to the spinner */
  showLabel?: boolean;
  /** Whether the loader centers itself in the available space */
  center?: boolean;
  /** When wrapping children, whether to render as an overlay on top */
  overlay?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export const Loader: React.FC<LoaderProps> = ({
  loading = true,
  size = "md",
  label = "Loading...",
  showLabel = false,
  center = false,
  overlay = false,
  className = "",
  children,
}) => {
  if (!loading) {
    return children ? <>{children}</> : null;
  }

  const sizeClass =
    size === "sm" ? styles.sizeSm : size === "lg" ? styles.sizeLg : styles.sizeMd;

  const content = (
    <div
      role="status"
      aria-live="polite"
      className={`${styles.loaderContainer} ${center ? styles.center : ""} ${className}`}
    >
      <span className={`${styles.spinner} ${sizeClass}`} aria-hidden="true" />
      {showLabel ? (
        <span className={styles.label}>{label}</span>
      ) : (
        <span className={styles.srOnly}>{label}</span>
      )}
    </div>
  );

  if (children && overlay) {
    return (
      <div className={styles.overlayWrapper}>
        {children}
        <div className={styles.overlay} role="status" aria-live="polite">
          <span className={`${styles.spinner} ${sizeClass}`} aria-hidden="true" />
          {showLabel && <span className={styles.label}>{label}</span>}
          <span className={styles.srOnly}>{label}</span>
        </div>
      </div>
    );
  }

  return content;
};
