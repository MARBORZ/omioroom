import React, { useEffect, useRef } from "react";
import { X, Sun, Moon, Monitor, Eye, Zap, Globe } from "lucide-react";
import { useSettings } from "../../../shared/lib/settings/index.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import styles from "./settings-modal.module.scss";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { theme, density, reducedMotion, setTheme, setDensity, setReducedMotion } = useSettings();
  const { lang, setLang, t } = useI18n();
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="presentation"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        className={styles.modal}
      >
        <div className={styles.header}>
          <h2 id="settings-dialog-title" className={styles.title}>
            {t.settings.title}
          </h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t.common.close}
          >
            <X size={18} />
          </button>
        </div>

        <div className={styles.body}>
          {/* Theme */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t.settings.theme}</label>
            <div className={styles.segmentedGroup} role="radiogroup" aria-label={t.settings.theme}>
              <button
                type="button"
                role="radio"
                aria-checked={theme === "system"}
                className={`${styles.segmentBtn} ${theme === "system" ? styles.active : ""}`}
                onClick={() => setTheme("system")}
              >
                <Monitor size={14} />
                <span>{t.settings.themeSystem}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === "dark"}
                className={`${styles.segmentBtn} ${theme === "dark" ? styles.active : ""}`}
                onClick={() => setTheme("dark")}
              >
                <Moon size={14} />
                <span>{t.settings.themeDark}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={theme === "light"}
                className={`${styles.segmentBtn} ${theme === "light" ? styles.active : ""}`}
                onClick={() => setTheme("light")}
              >
                <Sun size={14} />
                <span>{t.settings.themeLight}</span>
              </button>
            </div>
          </div>

          {/* Interface Density */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t.settings.density}</label>
            <div className={styles.segmentedGroup} role="radiogroup" aria-label={t.settings.density}>
              <button
                type="button"
                role="radio"
                aria-checked={density === "default"}
                className={`${styles.segmentBtn} ${density === "default" ? styles.active : ""}`}
                onClick={() => setDensity("default")}
              >
                <span>{t.settings.densityDefault}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={density === "compact"}
                className={`${styles.segmentBtn} ${density === "compact" ? styles.active : ""}`}
                onClick={() => setDensity("compact")}
              >
                <span>{t.settings.densityCompact}</span>
              </button>
            </div>
          </div>

          {/* Language */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t.settings.language}</label>
            <div className={styles.segmentedGroup} role="radiogroup" aria-label={t.settings.language}>
              <button
                type="button"
                role="radio"
                aria-checked={lang === "ru"}
                className={`${styles.segmentBtn} ${lang === "ru" ? styles.active : ""}`}
                onClick={() => setLang("ru")}
              >
                <Globe size={14} />
                <span>Русский</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={lang === "en"}
                className={`${styles.segmentBtn} ${lang === "en" ? styles.active : ""}`}
                onClick={() => setLang("en")}
              >
                <Globe size={14} />
                <span>English</span>
              </button>
            </div>
          </div>

          {/* Reduced Motion */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t.settings.reducedMotion}</label>
            <div className={styles.segmentedGroup} role="radiogroup" aria-label={t.settings.reducedMotion}>
              <button
                type="button"
                role="radio"
                aria-checked={reducedMotion === "system"}
                className={`${styles.segmentBtn} ${reducedMotion === "system" ? styles.active : ""}`}
                onClick={() => setReducedMotion("system")}
              >
                <span>{t.settings.motionSystem}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={reducedMotion === "reduce"}
                className={`${styles.segmentBtn} ${reducedMotion === "reduce" ? styles.active : ""}`}
                onClick={() => setReducedMotion("reduce")}
              >
                <Eye size={14} />
                <span>{t.settings.motionReduced}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={reducedMotion === "normal"}
                className={`${styles.segmentBtn} ${reducedMotion === "normal" ? styles.active : ""}`}
                onClick={() => setReducedMotion("normal")}
              >
                <Zap size={14} />
                <span>{t.settings.motionFull}</span>
              </button>
            </div>
          </div>
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" size="md" onClick={onClose}>
            {t.common.close}
          </Button>
        </div>
      </div>
    </div>
  );
};
