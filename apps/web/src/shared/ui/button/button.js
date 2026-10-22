import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from "react";
import styles from "./button.module.scss";
export const Button = forwardRef(({ variant = "secondary", size = "md", loading = false, icon, children, className, disabled, ...props }, ref) => {
    const variantClass = variant === "primary"
        ? styles.variantPrimary
        : variant === "secondary"
            ? styles.variantSecondary
            : variant === "ghost"
                ? styles.variantGhost
                : styles.variantDanger;
    const sizeClass = size === "sm"
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
    return (_jsxs("button", { ref: ref, className: classes, disabled: disabled || loading, ...props, children: [loading ? (_jsx("span", { className: styles.spinner, "aria-hidden": "true" })) : (icon && _jsx("span", { "aria-hidden": "true", children: icon })), children] }));
});
Button.displayName = "Button";
