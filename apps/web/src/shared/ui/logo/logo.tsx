import React from "react";
import styles from "./logo.module.scss";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = "md", showText = true, className = "" }) => {
  const markSize = size === "sm" ? 20 : size === "lg" ? 36 : 26;

  return (
    <div className={`${styles.logo} ${className}`} aria-label="OMIOROOM">
      <div className={styles.mark}>
        <svg
          width={markSize}
          height={markSize}
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.markIcon}
          aria-hidden="true"
        >
          <rect width="32" height="32" rx="7" fill="currentColor" fillOpacity="0.08" />
          <circle cx="11.5" cy="16" r="6.5" stroke="var(--color-accent, #FF6847)" strokeWidth="3" />
          <circle cx="20.5" cy="16" r="6.5" stroke="var(--color-accent, #FF6847)" strokeWidth="3" />
        </svg>
      </div>
      {showText && (
        <span className={styles.text}>
          <span className={styles.brandFirst}>OMIO</span>
          <span className={styles.brandSecond}>ROOM</span>
        </span>
      )}
    </div>
  );
};
