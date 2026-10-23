import React, { useState, useEffect } from "react";
import { Flag, X, Check } from "lucide-react";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Button } from "../../../shared/ui/button/button.js";
import styles from "./report-modal.module.scss";

interface ReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (reasonText: string) => Promise<void>;
  title?: string;
}

type ReasonKey = "video" | "insults" | "spam" | "other";

export const ReportModal: React.FC<ReportModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  title,
}) => {
  const { t } = useI18n();
  const [selectedReason, setSelectedReason] = useState<ReasonKey>("video");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedReason("video");
      setDetails("");
      setError(null);
      setSubmitting(false);
      return;
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const reasonOptions: Array<{ key: ReasonKey; label: string }> = [
    { key: "video", label: t.report.reasons.video },
    { key: "insults", label: t.report.reasons.insults },
    { key: "spam", label: t.report.reasons.spam },
    { key: "other", label: t.report.reasons.other },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const reasonLabel = t.report.reasons[selectedReason];
      const trimmedDetails = details.trim();
      const combined = trimmedDetails
        ? `${reasonLabel}: ${trimmedDetails}`.slice(0, 500)
        : reasonLabel;

      await onSubmit(combined);
      onClose();
    } catch {
      setError(t.report.failed);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={styles.backdrop}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-modal-title"
        className={styles.dialog}
      >
        <div className={styles.header}>
          <div className={styles.titleRow}>
            <Flag size={18} className={styles.flagIcon} />
            <h2 id="report-modal-title" className={styles.title}>
              {title || t.report.titleRoom}
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

        <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>{t.report.reasonLabel}</label>
            <div className={styles.optionsList}>
              {reasonOptions.map((opt) => (
                <button
                  type="button"
                  key={opt.key}
                  className={`${styles.optionBtn} ${selectedReason === opt.key ? styles.optionSelected : ""}`}
                  onClick={() => setSelectedReason(opt.key)}
                >
                  <span className={styles.radioDot}>
                    {selectedReason === opt.key && <Check size={12} />}
                  </span>
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={styles.field}>
            <textarea
              className={styles.textarea}
              placeholder={t.report.detailsPlaceholder}
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
            />
            <div className={styles.counter}>{details.length} / 500</div>
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <div className={styles.actions}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClose}
              disabled={submitting}
            >
              {t.common.close}
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              loading={submitting}
            >
              {t.report.send}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};
