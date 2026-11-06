import React, { useContext, useEffect, useRef, useState } from "react";
import { X, Sun, Moon, Monitor, Eye, Zap, Globe, Volume2, VolumeX } from "lucide-react";
import { CHAT_TEXT_SCALE_MAX, CHAT_TEXT_SCALE_MIN, useSettings } from "../../../shared/lib/settings/index.js";
import {
  CHAT_WIDTH_EVENT,
  CHAT_WIDTH_MAX,
  CHAT_WIDTH_MIN,
  clearChatWidth,
  readChatWidth,
  writeChatWidth,
} from "../../../shared/lib/chat-layout.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { SessionContext } from "../../../app/providers/session-context.js";
import { buildArchiveZip, localDay } from "../../../shared/lib/chat-archive/index.js";
import { showToast } from "../../../shared/ui/toast/toast.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Logo } from "../../../shared/ui/logo/logo.js";
import { BlacklistPanel } from "../../../widgets/blacklist-panel/index.js";
import styles from "./settings-modal.module.scss";

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  isOwner?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, isOwner = false }) => {
  // Not useSession(): this modal also renders where no session exists (and in tests)
  const user = useContext(SessionContext)?.user ?? null;
  const [exporting, setExporting] = useState(false);
  const exportChatArchive = async () => {
    setExporting(true);
    try {
      const zip = await buildArchiveZip(t.settings.archiveImage);
      if (!zip) {
        showToast(t.settings.archiveEmpty, { id: "chat-archive-empty" });
        return;
      }
      const url = URL.createObjectURL(zip.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `omioroom-chat-${localDay(new Date().toISOString())}.zip`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
    } finally {
      setExporting(false);
    }
  };
  const {
    theme,
    density,
    reducedMotion,
    soundNotifications,
    chatTextScale,
    setChatTextScale,
    setTheme,
    setDensity,
    setReducedMotion,
    setSoundNotifications,
  } = useSettings();
  const { lang, setLang, t } = useI18n();
  const modalRef = useRef<HTMLDivElement>(null);

  // Chat width: the same value the drag handle in the room edits (only meaningful beside the video, i.e. wide screens)
  const [chatWidth, setChatWidth] = useState<number | null>(() => readChatWidth());
  useEffect(() => {
    if (!isOpen) return;
    setChatWidth(readChatWidth());
    const onChange = (e: Event) => setChatWidth((e as CustomEvent<number | null>).detail);
    window.addEventListener(CHAT_WIDTH_EVENT, onChange);
    return () => window.removeEventListener(CHAT_WIDTH_EVENT, onChange);
  }, [isOpen]);
  const [wideScreen, setWideScreen] = useState(() => typeof window !== "undefined" && window.innerWidth > 720);
  useEffect(() => {
    const onResize = () => setWideScreen(window.innerWidth > 720);
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

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
          <div className={styles.headerTitleGroup}>
            <Logo size="sm" showText={false} />
            <h2 id="settings-dialog-title" className={styles.title}>
              {t.settings.title}
            </h2>
          </div>
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

          {/* Chat size */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t.settings.chatSection}</label>
            {wideScreen && (
              <div className={styles.rangeRow}>
                <span className={styles.rangeLabel}>{t.settings.chatWidth}</span>
                <input
                  type="range"
                  className={styles.range}
                  min={CHAT_WIDTH_MIN}
                  max={CHAT_WIDTH_MAX}
                  step={10}
                  value={chatWidth ?? Math.min(420, Math.round(window.innerWidth * 0.38))}
                  aria-label={t.settings.chatWidth}
                  onChange={(e) => writeChatWidth(Number(e.target.value))}
                />
                <button
                  type="button"
                  className={styles.rangeReset}
                  disabled={chatWidth === null}
                  onClick={() => clearChatWidth()}
                >
                  {t.settings.chatWidthDefault}
                </button>
              </div>
            )}
            <div className={styles.rangeRow}>
              <span className={styles.rangeLabel}>
                {t.settings.chatTextSize}: {Math.round(chatTextScale * 100)}%
              </span>
              <input
                type="range"
                className={styles.range}
                min={Math.round(CHAT_TEXT_SCALE_MIN * 100)}
                max={Math.round(CHAT_TEXT_SCALE_MAX * 100)}
                step={5}
                value={Math.round(chatTextScale * 100)}
                aria-label={t.settings.chatTextSize}
                onChange={(e) => setChatTextScale(Number(e.target.value) / 100)}
              />
              <button
                type="button"
                className={styles.rangeReset}
                disabled={chatTextScale === 1}
                onClick={() => setChatTextScale(1)}
              >
                {t.settings.chatWidthDefault}
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

          {/* Sound Notifications */}
          <div className={styles.section}>
            <label className={styles.sectionLabel}>{t.settings.soundNotifications}</label>
            <div className={styles.segmentedGroup} role="radiogroup" aria-label={t.settings.soundNotifications}>
              <button
                type="button"
                role="radio"
                aria-checked={soundNotifications}
                className={`${styles.segmentBtn} ${soundNotifications ? styles.active : ""}`}
                onClick={() => setSoundNotifications(true)}
              >
                <Volume2 size={14} />
                <span>{t.settings.soundOn}</span>
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!soundNotifications}
                className={`${styles.segmentBtn} ${!soundNotifications ? styles.active : ""}`}
                onClick={() => setSoundNotifications(false)}
              >
                <VolumeX size={14} />
                <span>{t.settings.soundOff}</span>
              </button>
            </div>
          </div>

          {/* Chat copy kept in this browser for rooms an admin owns */}
          {user?.role === "admin" && (
            <div className={styles.section}>
              <label className={styles.sectionLabel}>{t.settings.archiveSection}</label>
              <p className={styles.rangeLabel}>{t.settings.archiveHint}</p>
              <Button variant="secondary" size="md" onClick={() => void exportChatArchive()} loading={exporting}>
                {t.settings.archiveExport}
              </Button>
            </div>
          )}

          {/* Owner Blacklist */}
          {isOwner && (
            <div className={styles.section}>
              <BlacklistPanel embedded />
            </div>
          )}
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
