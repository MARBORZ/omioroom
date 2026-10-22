import React, { useState } from "react";
import { parseMediaUrl, type MediaSourceInfo } from "@omioroom/contracts";
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
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = parseMediaUrl(url);
    if (!parsed) {
      setError("Please enter a valid YouTube link or a direct .mp4/.webm video URL");
      return;
    }

    onMediaSelect(parsed);
    setUrl("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ width: "100%", display: "flex", flexDirection: "column", gap: "8px" }}>
      <div style={{ display: "flex", gap: "8px", alignItems: "flex-end" }}>
        <TextField
          label="Video Source"
          placeholder="Paste YouTube or direct MP4/WebM URL..."
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
          Add
        </Button>
      </div>
    </form>
  );
};
