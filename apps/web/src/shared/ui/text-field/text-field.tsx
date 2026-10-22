import React, { forwardRef } from "react";
import styles from "./text-field.module.scss";

export interface TextFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  mono?: boolean;
  endAdornment?: React.ReactNode;
}

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  (
    {
      label,
      error,
      helperText,
      mono = false,
      endAdornment,
      className,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className={`${styles.fieldWrapper} ${className || ""}`}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        <div
          className={`${styles.inputContainer} ${error ? styles.hasError : ""} ${
            disabled ? styles.disabled : ""
          }`}
        >
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={`${styles.input} ${mono ? styles.mono : ""}`}
            {...props}
          />
          {endAdornment && <div className={styles.endAdornment}>{endAdornment}</div>}
        </div>
        {error ? (
          <span className={styles.errorText} role="alert">
            {error}
          </span>
        ) : helperText ? (
          <span className={styles.helperText}>{helperText}</span>
        ) : null}
      </div>
    );
  }
);

TextField.displayName = "TextField";
