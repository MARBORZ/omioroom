import { jsx as _jsx } from "react/jsx-runtime";
import styles from "./pill.module.scss";
export const Pill = ({ variant = "default", children, className, }) => {
    const variantClass = variant === "accent"
        ? styles.accent
        : variant === "success"
            ? styles.success
            : variant === "warning"
                ? styles.warning
                : "";
    return (_jsx("span", { className: `${styles.pill} ${variantClass} ${className || ""}`, children: children }));
};
