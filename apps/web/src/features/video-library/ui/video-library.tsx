import React, { useEffect, useState } from "react";
import { Film } from "lucide-react";
import { listVideos, type Video } from "../../../shared/api/videos.js";
import { formatDuration, formatFileSize } from "../../../shared/lib/format-duration.js";
import styles from "./video-library.module.scss";

interface VideoLibraryProps {
  onPick: (video: Video) => void;
  disabled?: boolean;
}

/** The admin's uploaded videos as cards (preview, title, length); shown under the "MP4 / HLS" source. */
export const VideoLibrary: React.FC<VideoLibraryProps> = ({ onPick, disabled = false }) => {
  const [videos, setVideos] = useState<Video[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    listVideos()
      .then((list) => !cancelled && setVideos(list))
      .catch(() => !cancelled && setVideos([]));
    return () => {
      cancelled = true;
    };
  }, []);

  if (videos === null) return null;
  if (videos.length === 0) return <p className={styles.empty}>В библиотеке пока нет видео. Загрузите их на dashboard.</p>;

  return (
    <ul className={styles.grid}>
      {videos.map((v) => (
        <li key={v.id}>
          <button type="button" className={styles.card} disabled={disabled} onClick={() => onPick(v)}>
            <span className={styles.thumb}>
              {v.thumbnailUrl ? <img src={v.thumbnailUrl} alt="" loading="lazy" /> : <Film size={22} />}
              {v.durationSeconds !== null && <span className={styles.duration}>{formatDuration(v.durationSeconds)}</span>}
            </span>
            <span className={styles.title}>{v.title}</span>
            <span className={styles.meta}>{formatFileSize(v.sizeBytes)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
};
