import React, { useState } from "react";
import { parseMediaUrl, type MediaSourceInfo } from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Link2 } from "lucide-react";
import { VIDEO_SOURCES } from "../model/sources.js";
import styles from "./change-media-input.module.scss";

interface ChangeMediaInputProps {
  onMediaSelect: (media: MediaSourceInfo) => void;
  loading?: boolean;
  disabled?: boolean;
}

/** Pick where the video comes from, then paste its link. "Any link" accepts every supported source. */
export const ChangeMediaInput: React.FC<ChangeMediaInputProps> = ({
  onMediaSelect,
  loading = false,
  disabled = false,
}) => {
  const { t } = useI18n();
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const source = VIDEO_SOURCES.find((s) => s.id === sourceId) ?? null;
  const hints: Record<string, string> = {
    vk: t.room.hintVk,
    rutube: t.room.hintRutube,
    file: t.room.hintFile,
  };
  const sourceHint = source ? hints[source.id] : undefined;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseMediaUrl(url);
    if (!parsed) {
      setError(t.room.urlError);
      return;
    }
    if (source && !source.types.includes(parsed.type)) {
      setError(`${t.room.wrongSource} ${source.label}`);
      return;
    }

    onMediaSelect(parsed);
    setUrl("");
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.label}>{t.room.videoSource}</div>

      <div className={styles.chips} role="group" aria-label={t.room.videoSource}>
        <button
          type="button"
          className={`${styles.chip} ${source === null ? styles.active : ""}`}
          aria-pressed={source === null}
          onClick={() => setSourceId(null)}
          disabled={disabled}
        >
          {t.room.anyLink}
        </button>
        {VIDEO_SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`${styles.chip} ${source?.id === s.id ? styles.active : ""}`}
            aria-pressed={source?.id === s.id}
            onClick={() => setSourceId(s.id)}
            disabled={disabled}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className={styles.row}>
        <TextField
          aria-label={t.room.videoSource}
          placeholder={source ? source.example : t.room.videoSourcePlaceholder}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          disabled={disabled || loading}
          error={error || undefined}
          className={styles.field}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={disabled || loading || !url.trim()}
          loading={loading}
          icon={<Link2 size={16} />}
        >
          {t.room.addVideo}
        </Button>
      </div>
      {sourceHint && <p className={styles.hint}>{sourceHint}</p>}
    </form>
  );
};
