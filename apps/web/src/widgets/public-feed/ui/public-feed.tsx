import React, { useState, useEffect, useRef, useCallback } from "react";
import { Users, Tv, Play, Film } from "lucide-react";
import { backend, type FeedRoomDto } from "../../../shared/api/backend.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { Skeleton } from "../../../shared/ui/skeleton/skeleton.js";
import styles from "./public-feed.module.scss";

interface PublicFeedProps {
  onJoinRoom: (globalId: string) => Promise<void> | void;
}

function formatPlatformName(type?: string | null): string {
  if (!type) return "";
  switch (type.toLowerCase()) {
    case "youtube":
      return "YouTube";
    case "vk":
      return "VK Видео";
    case "rutube":
      return "RuTube";
    case "vimeo":
      return "Vimeo";
    default:
      return type.toUpperCase();
  }
}

export const PublicFeed: React.FC<PublicFeedProps> = ({ onJoinRoom }) => {
  const { t } = useI18n();
  const [rooms, setRooms] = useState<FeedRoomDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const lastFetchedRef = useRef(0);

  const fetchRooms = useCallback(async () => {
    try {
      const data = await backend.getRecommendations(24);
      setRooms(data);
      lastFetchedRef.current = Date.now();
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRooms();

    const interval = setInterval(() => {
      void fetchRooms();
    }, 30000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (Date.now() - lastFetchedRef.current >= 30000) {
          void fetchRooms();
        }
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [fetchRooms]);

  const handleCardClick = async (globalId: string) => {
    if (joiningId) return;
    setJoiningId(globalId);
    try {
      await onJoinRoom(globalId);
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <section className={styles.feedSection} data-layout="public-feed" aria-label={t.feed.title}>
      <div className={styles.feedHeader}>
        <div className={styles.titleRow}>
          <Tv size={18} className={styles.headerIcon} />
          <h2 className={styles.title}>{t.feed.title}</h2>
        </div>
      </div>

      {loading && rooms.length === 0 ? (
        <div className={styles.feedGrid}>
          {[1, 2, 3].map((i) => (
            <div key={i} className={styles.skeletonCard}>
              <Skeleton className={styles.skeletonThumb} />
              <div className={styles.skeletonDetails}>
                <Skeleton className={styles.skeletonAvatar} />
                <div className={styles.skeletonLines}>
                  <Skeleton className={styles.skeletonLine} />
                  <Skeleton className={styles.skeletonLineShort} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>{t.feed.empty}</p>
        </div>
      ) : (
        <div className={styles.feedGrid}>
          {rooms.map((room) => {
            const platformName = formatPlatformName(room.platform);
            const title = room.title || platformName || "Видео";
            const isJoining = joiningId === room.globalId;
            const ownerInitial = (room.ownerName?.trim()?.[0] || "U").toUpperCase();

            return (
              <button
                type="button"
                key={room.globalId}
                className={`${styles.feedCard} ${isJoining ? styles.joining : ""}`}
                onClick={() => handleCardClick(room.globalId)}
                disabled={Boolean(joiningId)}
              >
                <div className={styles.thumbWrapper}>
                  {room.thumbnailUrl ? (
                    <img
                      src={room.thumbnailUrl}
                      alt=""
                      className={styles.thumbnail}
                      loading="lazy"
                    />
                  ) : (
                    <div className={styles.fallbackThumb}>
                      <Film size={32} className={styles.fallbackIcon} />
                    </div>
                  )}
                  {platformName && <span className={styles.platformBadge}>{platformName}</span>}
                  {room.status === "playing" && (
                    <span className={styles.liveBadge}>
                      <Play size={10} fill="currentColor" />
                      <span>LIVE</span>
                    </span>
                  )}
                </div>

                <div className={styles.cardDetails}>
                  <div className={styles.avatar} aria-hidden="true">
                    {ownerInitial}
                  </div>
                  <div className={styles.metaCol}>
                    <div className={styles.cardTitle} title={title}>
                      {title}
                    </div>
                    <div className={styles.ownerRow} title={room.ownerName}>
                      <span className={styles.ownerName}>{room.ownerName}</span>
                    </div>
                    <div className={styles.statsRow}>
                      <span className={styles.participants}>
                        <Users size={12} className={styles.metaIcon} />
                        <span>{t.feed.participants(room.participantCount, room.maxParticipants)}</span>
                      </span>
                      <span className={styles.roomCode}>#{room.globalId}</span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
};
