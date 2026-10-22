import React, { useState } from "react";
import { parseMediaUrl, type MediaSourceInfo } from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { TextField } from "../../../shared/ui/text-field/text-field.js";
import { Button } from "../../../shared/ui/button/button.js";
import { Link2 } from "lucide-react";

interface ChangeMediaInputProps {
  onMediaSelect: (media: MediaSourceInfo) => void;
  loading?: boolean;
  disabled?: boolean;
}

export const ChangeMediaInput: React.FC<ChangeMediaInputProps> = ({
  onMediaSelect,
  loading = false,
  disabled = false,
}) => {
  const { t } = useI18n();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseMediaUrl(url);
    if (!parsed) {
      setError(t.room.urlError);
      return;
    }

    onMediaSelect(parsed);
    setUrl("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        <TextField
          label={t.room.videoSource}
          placeholder={t.room.videoSourcePlaceholder}
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (error) setError(null);
          }}
          disabled={disabled || loading}
          error={error || undefined}
          style={{ flex: 1 }}
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
    </form>
  );
};
