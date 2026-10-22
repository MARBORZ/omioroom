import React, { forwardRef } from "react";
import styles from "./button.module.scss";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      loading = false,
      icon,
      children,
      className,
      disabled,
      ...props
    },
    ref
  ) => {
    const variantClass =
      variant === "primary"
        ? styles.variantPrimary
        : variant === "secondary"
        ? styles.variantSecondary
        : variant === "ghost"
        ? styles.variantGhost
        : styles.variantDanger;

    const sizeClass =
      size === "sm"
        ? styles.sizeSm
        : size === "lg"
        ? styles.sizeLg
        : styles.sizeMd;

    const classes = [
      styles.button,
      variantClass,
      sizeClass,
      loading ? styles.loading : "",
      className || "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button ref={ref} className={classes} disabled={disabled || loading} {...props}>
        {loading ? (
          <span className={styles.spinner} aria-hidden="true" />
        ) : (
          icon && <span aria-hidden="true">{icon}</span>
        )}
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
