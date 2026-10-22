import React from "react";
import styles from "./logo.module.scss";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  showText?: boolean;
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ size = "md", showText = true, className = "" }) => {
  const markSize = size === "sm" ? 16 : size === "lg" ? 30 : 22;

  return (
    <div className={`${styles.logo} ${className}`} aria-label="OMIOROOM">
      <div className={styles.mark}>
        <svg
          height={markSize}
          viewBox="4 14 56 36"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          className={styles.markIcon}
          style={{ width: "auto", aspectRatio: "56 / 36" }}
          aria-hidden="true"
        >
          <circle cx="22" cy="32" r="14" stroke="var(--color-text, #F4F0E8)" strokeWidth="6" />
          <circle cx="42" cy="32" r="14" stroke="var(--color-accent, #FF6847)" strokeWidth="6" />
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
