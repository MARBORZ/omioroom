import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { VolumeX } from "lucide-react";
import {
  MediaType,
  PlaybackStatus,
  calculateExpectedPosition,
  SYNC_THRESHOLD_IGNORE_MS,
  SYNC_THRESHOLD_DRIFT_RATE_MS,
  type RoomPlaybackStateDto,
  type MediaSourceInfo,
} from "@omioroom/contracts";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import type { PlayerAdapter, PlayerAdapterEvent } from "../../../shared/lib/adapters/player-adapter.js";
import { Html5PlayerAdapter } from "../../../shared/lib/adapters/html5-adapter.js";
import { YouTubePlayerAdapter } from "../../../shared/lib/adapters/youtube-adapter.js";
import { HlsPlayerAdapter } from "../../../shared/lib/adapters/hls-adapter.js";
import { VkPlayerAdapter } from "../../../shared/lib/adapters/vk-adapter.js";
import { RutubePlayerAdapter } from "../../../shared/lib/adapters/rutube-adapter.js";
import { TwitchPlayerAdapter } from "../../../shared/lib/adapters/twitch-adapter.js";
import { VimeoPlayerAdapter } from "../../../shared/lib/adapters/vimeo-adapter.js";
import styles from "./video-player-frame.module.scss";

export interface VideoPlayerHandle {
  play: () => Promise<void>;
  pause: () => Promise<void>;
  seek: (seconds: number) => Promise<void>;
  getCurrentTime: () => number;
  getDuration: () => number;
}

export interface UserPlayerAction {
  type: "play" | "pause" | "seek";
  position: number;
}

/** Local actions made inside the embedded player's own UI are reported to the room. */
const REMOTE_APPLY_GUARD_MS = 800;
const USER_SEEK_JUMP_SECONDS = 1.5;
const DRIFT_CHECK_INTERVAL_MS = 1000;

export interface VideoPlayerFrameProps {
  playbackState: RoomPlaybackStateDto | null;
  getEstimatedServerNow: () => number;
  onUserAction?: (action: UserPlayerAction) => void;
  /** Without control permission, local actions in the player are undone instead of reported. */
  canControl?: boolean;
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
      getEstimatedServerNow,
      onUserAction,
      canControl = true,
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
    // Latest props/state for handlers bound once at adapter creation
    const latest = useRef({
      playbackState,
      canControl,
      getEstimatedServerNow,
      onUserAction,
      onPositionUpdate,
      onPlayStateChange,
      onBufferingChange,
    });
    latest.current = {
      playbackState,
      canControl,
      getEstimatedServerNow,
      onUserAction,
      onPositionUpdate,
      onPlayStateChange,
      onBufferingChange,
    };

    // Events fired by our own programmatic play/pause/seek must not be re-sent as user actions
    const guardUntilRef = useRef(0);
    const adapterPlayingRef = useRef(false);
    const appliedRateRef = useRef(1);
    const lastSampleRef = useRef<{ time: number; wall: number } | null>(null);

    // A local action in the player: report it when allowed, otherwise snap back to the room state
    const handleLocalAction = (action: UserPlayerAction) => {
      const cur = latest.current;
      if (cur.canControl) {
        cur.onUserAction?.(action);
      } else {
        revertRef.current();
      }
    };
    const revertRef = useRef<() => void>(() => {});

    const armGuard = () => {
      guardUntilRef.current = Date.now() + REMOTE_APPLY_GUARD_MS;
      lastSampleRef.current = null;
    };
    const isGuarded = () => Date.now() < guardUntilRef.current;

    const [overlayStatus, setOverlayStatus] = useState<string | null>(null);

    useImperativeHandle(ref, () => ({
      play: async () => {
        armGuard();
        await adapterRef.current?.play();
      },
      pause: async () => {
        armGuard();
        await adapterRef.current?.pause();
      },
      seek: async (sec: number) => {
        armGuard();
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

      let adapter: PlayerAdapter;
      switch (media.type) {
        case MediaType.YOUTUBE:
          adapter = new YouTubePlayerAdapter();
          break;
        case MediaType.HLS:
          adapter = new HlsPlayerAdapter();
          break;
        case MediaType.VK:
          adapter = new VkPlayerAdapter();
          break;
        case MediaType.RUTUBE:
          adapter = new RutubePlayerAdapter();
          break;
        case MediaType.TWITCH:
          adapter = new TwitchPlayerAdapter();
          break;
        case MediaType.VIMEO:
          adapter = new VimeoPlayerAdapter();
          break;
        case MediaType.HTML5:
        default:
          adapter = new Html5PlayerAdapter();
          break;
      }

      await adapter.attach(containerRef.current);
      adapterRef.current = adapter;
      adapterPlayingRef.current = false;
      appliedRateRef.current = 1;
      currentMediaTypeRef.current = media.type;

      adapter.onStateChange((event: PlayerAdapterEvent) => {
        const cur = latest.current;
        const server = cur.playbackState;

        if (event.type === "timeupdate") {
          cur.onPositionUpdate(event.currentTime, event.duration);

          // A discontinuity not caused by us is a seek made in the player's own UI
          const now = Date.now();
          const prev = lastSampleRef.current;
          lastSampleRef.current = { time: event.currentTime, wall: now };
          if (prev && !isGuarded() && server?.media) {
            const rate = adapterPlayingRef.current ? server.playbackRate : 0;
            const expectedDelta = ((now - prev.wall) / 1000) * rate;
            const jump = event.currentTime - prev.time - expectedDelta;
            if (Math.abs(jump) > USER_SEEK_JUMP_SECONDS) {
              handleLocalAction({ type: "seek", position: event.currentTime });
            }
          }
        } else if (event.type === "play") {
          adapterPlayingRef.current = true;
          cur.onBufferingChange?.(false);
          cur.onPlayStateChange?.(true);
          if (!isGuarded() && server?.media && server.status !== PlaybackStatus.PLAYING) {
            handleLocalAction({ type: "play", position: event.currentTime });
          }
        } else if (event.type === "pause") {
          adapterPlayingRef.current = false;
          cur.onPlayStateChange?.(false);
          if (!isGuarded() && server?.media && server.status === PlaybackStatus.PLAYING) {
            handleLocalAction({ type: "pause", position: event.currentTime });
          }
        } else if (event.type === "ended") {
          adapterPlayingRef.current = false;
          cur.onPlayStateChange?.(false);
        } else if (event.type === "buffering") {
          cur.onBufferingChange?.(true);
        } else if (event.type === "error") {
          setOverlayStatus(event.error || "Playback error");
        }
      });
    }

    if (adapterRef.current) {
      await adapterRef.current.loadMedia(media);
    }
  }, []);

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

  // Apply authoritative server state. Runs only when the server state changes,
  // never on local position ticks, and only touches the player when it differs.
  const applyServerState = useCallback(() => {
    const adapter = adapterRef.current;
    const state = latest.current.playbackState;
    if (!adapter || !state || !state.media) return;

    armGuard();
    const expected = calculateExpectedPosition(state, latest.current.getEstimatedServerNow());

    if (state.status === PlaybackStatus.PLAYING) {
      if (!adapterPlayingRef.current) adapter.play().catch(() => {});
    } else if (adapterPlayingRef.current) {
      adapter.pause().catch(() => {});
    }

    if (appliedRateRef.current !== state.playbackRate) {
      appliedRateRef.current = state.playbackRate;
      adapter.setPlaybackRate(state.playbackRate).catch(() => {});
    }

    const target = state.status === PlaybackStatus.PLAYING ? expected : state.anchorPosition;
    if (Math.abs(adapter.getCurrentTime() - target) > SYNC_THRESHOLD_DRIFT_RATE_MS / 1000) {
      adapter.seek(target).catch(() => {});
    }
  }, []);
  revertRef.current = applyServerState;

  useEffect(() => {
    applyServerState();
  }, [playbackState, applyServerState]);

  // Periodic drift correction while playing
  useEffect(() => {
    const timer = setInterval(() => {
      const adapter = adapterRef.current;
      const state = latest.current.playbackState;
      if (
        !adapter ||
        !state?.media ||
        state.status !== PlaybackStatus.PLAYING ||
        !adapterPlayingRef.current ||
        adapter.isBuffering() ||
        isGuarded()
      ) {
        return;
      }

      const expected = calculateExpectedPosition(state, latest.current.getEstimatedServerNow());
      const drift = adapter.getCurrentTime() - expected;
      const abs = Math.abs(drift);

      if (abs > SYNC_THRESHOLD_DRIFT_RATE_MS / 1000) {
        armGuard();
        adapter.seek(expected).catch(() => {});
        return;
      }

      const desiredRate =
        abs > SYNC_THRESHOLD_IGNORE_MS / 1000
          ? state.playbackRate * (drift < 0 ? 1.05 : 0.95)
          : state.playbackRate;
      if (appliedRateRef.current !== desiredRate) {
        appliedRateRef.current = desiredRate;
        adapter.setPlaybackRate(desiredRate).catch(() => {});
      }
    }, DRIFT_CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);

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
