import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { VolumeX } from "lucide-react";
import {
  MediaType,
  PlaybackStatus,
  calculateExpectedPosition,
  type RoomPlaybackStateDto,
  type MediaSourceInfo,
} from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import type { PlayerAdapter, PlayerAdapterEvent } from "../../../shared/lib/adapters/player-adapter.js";
import { Html5PlayerAdapter } from "../../../shared/lib/adapters/html5-adapter.js";
import { YouTubePlayerAdapter } from "../../../shared/lib/adapters/youtube-adapter.js";
import styles from "./video-player-frame.module.scss";

export interface VideoPlayerHandle {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  getCurrentTime: () => number;
  getDuration: () => number;
}

export interface VideoPlayerFrameProps {
  playbackState: RoomPlaybackStateDto | null;
  estimatedServerNow: number;
  onPositionUpdate: (currentTime: number, duration: number) => void;
  onPlayStateChange?: (isPlaying: boolean) => void;
  onBufferingChange?: (isBuffering: boolean) => void;
  isMuted?: boolean;
  onToggleMute?: () => void;
}

export const VideoPlayerFrame = forwardRef<VideoPlayerHandle, VideoPlayerFrameProps>(
  (
    {
      playbackState,
      estimatedServerNow,
      onPositionUpdate,
      onPlayStateChange,
      onBufferingChange,
      isMuted = false,
      onToggleMute,
    },
    ref
  ) => {
    const { t } = useI18n();
    const containerRef = useRef<HTMLDivElement>(null);
    const adapterRef = useRef<PlayerAdapter | null>(null);
    const currentMediaTypeRef = useRef<MediaType | null>(null);
    const isSyncingRef = useRef(false);

    const [overlayStatus, setOverlayStatus] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      play: async () => {
        await adapterRef.current?.play();
      },
      pause: async () => {
        await adapterRef.current?.pause();
      },
      seek: async (sec: number) => {
        await adapterRef.current?.seek(sec);
      },
      getCurrentTime: () => adapterRef.current?.getCurrentTime() || 0,
      getDuration: () => adapterRef.current?.getDuration() || 0,
    }));

  // Initialize or swap adapter when media type changes
  const initAdapter = useCallback(async (media: MediaSourceInfo | null) => {
    if (!containerRef.current) return;

    if (!media) {
      if (adapterRef.current) {
        adapterRef.current.destroy();
        adapterRef.current = null;
        currentMediaTypeRef.current = null;
      }
      return;
    }

    if (currentMediaTypeRef.current !== media.type) {
      if (adapterRef.current) {
        adapterRef.current.destroy();
      }

      const adapter: PlayerAdapter =
        media.type === MediaType.YOUTUBE
          ? new YouTubePlayerAdapter()
          : new Html5PlayerAdapter();

      await adapter.attach(containerRef.current);
      adapterRef.current = adapter;
      currentMediaTypeRef.current = media.type;

      adapter.onStateChange((event: PlayerAdapterEvent) => {
        if (event.type === "timeupdate") {
          onPositionUpdate(event.currentTime, event.duration);
        } else if (event.type === "play") {
          onPlayStateChange?.(true);
        } else if (event.type === "pause" || event.type === "ended") {
          onPlayStateChange?.(false);
        } else if (event.type === "buffering") {
          onBufferingChange?.(true);
        } else if (event.type === "error") {
          setOverlayStatus(event.error || "Playback error");
        }
      });
    }

    if (adapterRef.current) {
      await adapterRef.current.loadMedia(media);
    }
  }, [onPositionUpdate, onPlayStateChange, onBufferingChange]);

  // Handle media source changes
  useEffect(() => {
    initAdapter(playbackState?.media ?? null);
  }, [playbackState?.media, initAdapter]);

  // Handle mute changes
  useEffect(() => {
    if (adapterRef.current) {
      adapterRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  // Synchronization with server state
  useEffect(() => {
    if (!adapterRef.current || !playbackState || !playbackState.media) return;

    const adapter = adapterRef.current;
    const expected = calculateExpectedPosition(playbackState, estimatedServerNow);
    const actual = adapter.getCurrentTime();
    const driftSeconds = Math.abs(actual - expected);

    // Apply play/pause state
    if (playbackState.status === PlaybackStatus.PLAYING) {
      adapter.play().catch(() => {});
    } else if (playbackState.status === PlaybackStatus.PAUSED) {
      adapter.pause().catch(() => {});
    }

    // Apply rate
    adapter.setPlaybackRate(playbackState.playbackRate).catch(() => {});

    // Sync drift correction
    if (driftSeconds > 0.75) {
      // Seek threshold exceeded: seek directly
      isSyncingRef.current = true;
      adapter.seek(expected).finally(() => {
        setTimeout(() => {
          isSyncingRef.current = false;
        }, 300);
      });
    } else if (driftSeconds > 0.25) {
      // Slight drift: compensate smoothly with tempo adjustment
      const nudge = actual < expected ? 1.05 : 0.95;
      adapter.setPlaybackRate(playbackState.playbackRate * nudge).catch(() => {});
    } else {
      adapter.setPlaybackRate(playbackState.playbackRate).catch(() => {});
    }
  }, [playbackState, estimatedServerNow]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
  }, []);

  return (
    <div className={styles.playerFrame}>
      <div ref={containerRef} className={styles.adapterContainer} />

      {!playbackState?.media && (
        <div className={styles.placeholder}>
          <div className={styles.retroTag}>{t.room.standby}</div>
          <p className={styles.placeholderText}>
            {t.room.standbyDesc}
          </p>
        </div>
      )}

      {overlayStatus && (
        <div className={styles.overlayMessage}>
          {overlayStatus}
        </div>
      )}

      {playbackState?.status === PlaybackStatus.PLAYING && isMuted && onToggleMute && (
        <button
          type="button"
          className={styles.unmuteBadge}
          onClick={onToggleMute}
          aria-label={t.room.unmute}
        >
          <VolumeX size={15} />
          <span>{t.room.unmute}</span>
        </button>
      )}
    </div>
  );
});

VideoPlayerFrame.displayName = "VideoPlayerFrame";
