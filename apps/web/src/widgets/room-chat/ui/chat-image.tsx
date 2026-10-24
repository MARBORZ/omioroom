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
  path?: string | null;
  previewUrl?: string | null;
  isUploading?: boolean;
  onOpen?: (url: string) => void;
  openLabel?: string;
  className: { readonly [key: string]: string };
  onLoad?: () => void;
}

export const ChatImage: React.FC<ChatImageProps> = ({
  path,
  previewUrl,
  isUploading = false,
  onOpen,
  openLabel = "Open image",
  className,
  onLoad,
}) => {
  const [url, setUrl] = useState<string | null>(previewUrl || null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (previewUrl) {
      setUrl(previewUrl);
      setIsLoaded(true);
      return;
    }
    if (!path) return;
    let alive = true;
    resolveUrl(path)
      .then((u) => {
        if (alive) setUrl(u);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [path, previewUrl]);

  if (failed) {
    return (
      <div className={className.imageFailed || className.imagePlaceholder} title="Failed to load image">
        <span className={className.imageFailedIcon}>🖼️</span>
      </div>
    );
  }

  return (
    <div className={className.imageContainer || ""}>
      {/* Apple-grade Shimmer skeleton while resolving URL or decoding image */}
      {!isLoaded && (
        <div className={className.imageSkeleton || className.imagePlaceholder} aria-hidden>
          <div className={className.shimmerEffect} />
          {isUploading && (
            <div className={className.uploadingBadge}>
              <div className={className.uploadSpinner} />
            </div>
          )}
        </div>
      )}

      {url && (
        <button
          type="button"
          className={`${className.imageButton} ${isLoaded ? className.imageLoaded : className.imageLoading}`}
          onClick={() => onOpen?.(url)}
          aria-label={openLabel}
          disabled={!onOpen}
        >
          <img
            src={url}
            alt=""
            className={className.image}
            loading="lazy"
            referrerPolicy="no-referrer"
            onLoad={() => {
              setIsLoaded(true);
              onLoad?.();
            }}
          />
          {isUploading && (
            <div className={className.uploadingGlassOverlay} aria-label="Uploading">
              <div className={className.uploadSpinner} />
            </div>
          )}
        </button>
      )}
    </div>
  );
};
