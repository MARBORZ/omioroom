import React, { useState, useRef, useEffect } from "react";
import { ChevronDown, Globe, Play, Film, Video, FileVideo } from "lucide-react";
import { VIDEO_SOURCES } from "../model/sources.js";
import styles from "./source-select.module.scss";

interface SourceSelectProps {
  value: string | null;
  onChange: (sourceId: string | null) => void;
  anyLinkLabel: string;
  disabled?: boolean;
}

function getSourceIcon(id: string | null) {
  switch (id) {
    case "youtube":
      return <Play size={14} />;
    case "vk":
    case "rutube":
      return <Film size={14} />;
    case "vimeo":
      return <Video size={14} />;
    case "file":
      return <FileVideo size={14} />;
    default:
      return <Globe size={14} />;
  }
}

export const SourceSelect: React.FC<SourceSelectProps> = ({
  value,
  onChange,
  anyLinkLabel,
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedSource = VIDEO_SOURCES.find((s) => s.id === value) ?? null;
  const currentLabel = selectedSource ? selectedSource.label : anyLinkLabel;

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    window.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const handleSelect = (id: string | null) => {
    onChange(id);
    setIsOpen(false);
  };

  return (
    <div className={styles.wrapper} ref={containerRef}>
      <button
        type="button"
        className={`${styles.trigger} ${isOpen ? styles.triggerActive : ""}`}
        onClick={() => !disabled && setIsOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span className={styles.triggerIcon}>{getSourceIcon(value)}</span>
        <span className={styles.triggerLabel}>{currentLabel}</span>
        <ChevronDown size={14} className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ""}`} />
      </button>

      {isOpen && (
        <div className={`${styles.dropdown} motion-pop`} role="listbox">
          <button
            type="button"
            className={`${styles.option} ${value === null ? styles.optionSelected : ""}`}
            role="option"
            aria-selected={value === null}
            onClick={() => handleSelect(null)}
          >
            <span className={styles.optionIcon}>{getSourceIcon(null)}</span>
            <span className={styles.optionText}>{anyLinkLabel}</span>
          </button>

          {VIDEO_SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`${styles.option} ${value === s.id ? styles.optionSelected : ""}`}
              role="option"
              aria-selected={value === s.id}
              onClick={() => handleSelect(s.id)}
            >
              <span className={styles.optionIcon}>{getSourceIcon(s.id)}</span>
              <span className={styles.optionText}>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
