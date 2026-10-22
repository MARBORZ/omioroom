import React, { useEffect, useState } from "react";
import { backend } from "../../../shared/api/backend.js";

const cache = new Map<string, { url: string; expiresAt: number }>();

async function resolveUrl(path: string): Promise<string> {
  const hit = cache.get(path);
  if (hit && hit.expiresAt > Date.now()) return hit.url;
  const url = await backend.signedImageUrl(path);
  // Signed URLs live one hour; refresh a little earlier
  cache.set(path, { url, expiresAt: Date.now() + 50 * 60 * 1000 });
  return url;
}

interface ChatImageProps {
  path: string;
  onOpen: (url: string) => void;
  openLabel: string;
  className: { readonly [key: string]: string };
  onLoad?: () => void;
}

export const ChatImage: React.FC<ChatImageProps> = ({ path, onOpen, openLabel, className, onLoad }) => {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    resolveUrl(path)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [path]);

  if (failed) return <span className={className.text}>🖼️ ?</span>;
  if (!url) return <span className={className.imagePlaceholder} aria-hidden />;
  return (
    <button type="button" className={className.imageButton} onClick={() => onOpen(url)} aria-label={openLabel}>
      <img
        src={url}
        alt=""
        className={className.image}
        loading="lazy"
        referrerPolicy="no-referrer"
        onLoad={onLoad}
      />
    </button>
  );
};
