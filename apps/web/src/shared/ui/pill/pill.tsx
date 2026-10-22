import React from "react";
import styles from "./pill.module.scss";

interface PillProps {
  variant?: "default" | "accent" | "success" | "warning";
  children: React.ReactNode;
  className?: string;
}

export const Pill: React.FC<PillProps> = ({
  variant = "default",
  children,
  className,
}) => {
  const variantClass =
    variant === "accent"
      ? styles.accent
      : variant === "success"
      ? styles.success
      : variant === "warning"
      ? styles.warning
      : "";

  return (
    <span className={`${styles.pill} ${variantClass} ${className || ""}`}>
      {children}
    </span>
  );
};
