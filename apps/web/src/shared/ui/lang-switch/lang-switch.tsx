import React from "react";
import { useI18n } from "../../lib/i18n/index.js";
import styles from "./lang-switch.module.scss";

export const LangSwitch: React.FC<{ className?: string }> = ({ className }) => {
  const { lang, toggleLang } = useI18n();

  return (
    <button
      type="button"
      className={`${styles.langBtn} ${className || ""}`}
      onClick={toggleLang}
      title={lang === "en" ? "Переключить на русский" : "Switch to English"}
      aria-label={`Current language: ${lang.toUpperCase()}. Click to switch language.`}
    >
      <span className={lang === "en" ? styles.active : ""}>EN</span>
      <span className={styles.divider}>/</span>
      <span className={lang === "ru" ? styles.active : ""}>RU</span>
    </button>
  );
};
