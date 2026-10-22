import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { forwardRef } from "react";
import styles from "./text-field.module.scss";
export const TextField = forwardRef(({ label, error, helperText, mono = false, endAdornment, className, disabled, id, ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);
    return (_jsxs("div", { className: `${styles.fieldWrapper} ${className || ""}`, children: [label && (_jsx("label", { htmlFor: inputId, className: styles.label, children: label })), _jsxs("div", { className: `${styles.inputContainer} ${error ? styles.hasError : ""} ${disabled ? styles.disabled : ""}`, children: [_jsx("input", { id: inputId, ref: ref, disabled: disabled, className: `${styles.input} ${mono ? styles.mono : ""}`, ...props }), endAdornment && _jsx("div", { className: styles.endAdornment, children: endAdornment })] }), error ? (_jsx("span", { className: styles.errorText, role: "alert", children: error })) : helperText ? (_jsx("span", { className: styles.helperText, children: helperText })) : null] }));
});
TextField.displayName = "TextField";
