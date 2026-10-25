import React, { useState } from "react";
import { parseAllowedMediaUrl, type MediaSourceInfo } from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { Button } from "../../../shared/ui/button/button.js";
import { showToast } from "../../../shared/ui/toast/toast.js";
import { Link2 } from "lucide-react";
import { VIDEO_SOURCES } from "../model/sources.js";
import { SourceSelect } from "./source-select.js";
import styles from "./change-media-input.module.scss";

interface ChangeMediaInputProps {
  onMediaSelect: (media: MediaSourceInfo) => Promise<boolean | void> | boolean | void;
  currentMedia?: MediaSourceInfo | null;
  isOpenRoom?: boolean;
  loading?: boolean;
  disabled?: boolean;
}

function isLikelyDirectFileOrUnsupported(val: string): boolean {
  const trimmed = val.trim();
  if (!trimmed) return false;
  if (/\.(mp4|webm|m3u8)(\?.*)?$/i.test(trimmed)) return true;
  if (/^https?:\/\//i.test(trimmed) && !parseAllowedMediaUrl(trimmed)) return true;
  return false;
}

/** Pick where the video comes from, then paste its link. "Any link" accepts every supported source. */
export const ChangeMediaInput: React.FC<ChangeMediaInputProps> = ({
  onMediaSelect,
  currentMedia,
  isOpenRoom = false,
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
    kodik: t.room.hintKodik,
  };
  const sourceHint = source ? hints[source.id] : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmed = url.trim();
    if (/https?:\/\/(?:[a-zA-Z0-9-]+\.)*(?:hdrezka|rezka)\.[a-z]+/i.test(trimmed)) {
      setError(t.room.hdrezkaNotEmbeddableHint);
      return;
    }

    const parsed = parseAllowedMediaUrl(trimmed);
    if (!parsed) {
      setError(t.room.supportedPlatformsHint);
      return;
    }
    if (source && !source.types.includes(parsed.type)) {
      setError(`${t.room.wrongSource} ${source.label}`);
      return;
    }

    if (
      currentMedia &&
      parsed.type === currentMedia.type &&
      ((parsed.sourceId && currentMedia.sourceId && parsed.sourceId === currentMedia.sourceId) ||
        parsed.canonicalUrl === currentMedia.canonicalUrl)
    ) {
      showToast(t.room.mediaAlreadyLoaded, { id: "media-already-loaded" });
      return;
    }

    try {
      const res = await onMediaSelect(parsed);
      if (res !== false) {
        setUrl("");
      }
    } catch {
      // Do not clear the URL on failure
    }
  };

  return (
    <form onSubmit={handleSubmit} className={styles.form}>
      <div className={styles.label}>{t.room.videoSource}</div>

      <div className={styles.sourceSelectorRow}>
        <SourceSelect
          value={sourceId}
          onChange={setSourceId}
          anyLinkLabel={t.room.anyLink}
          disabled={disabled}
        />
      </div>

      <div className={styles.row}>
        <TextField
          aria-label={t.room.videoSource}
          placeholder={source ? source.example : t.room.videoSourcePlaceholder}
          value={url}
          onChange={(e) => {
            const val = e.target.value;
            setUrl(val);
            if (isLikelyDirectFileOrUnsupported(val)) {
              setError(t.room.supportedPlatformsHint);
            } else if (error) {
              setError(null);
            }
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
      {isOpenRoom && <p className={styles.hint}>{t.room.openRoomMediaHint}</p>}
    </form>
  );
};
