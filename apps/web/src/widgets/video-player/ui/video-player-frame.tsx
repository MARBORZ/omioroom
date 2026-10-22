import { useEffect, useRef, useState, useCallback, forwardRef, useImperativeHandle } from "react";
import { Play, VolumeX } from "lucide-react";
import {
  MediaType,
  PlaybackStatus,
  calculateExpectedPosition,
  SYNC_THRESHOLD_IGNORE_MS,
  SYNC_THRESHOLD_DRIFT_RATE_MS,
  BUFFER_STALL_DEBOUNCE_MS,
  BUFFER_WAIT_TIMEOUT_MS,
  BUFFER_READY_AHEAD_SECONDS,
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
import { VimeoPlayerAdapter } from "../../../shared/lib/adapters/vimeo-adapter.js";
import { Skeleton } from "../../../shared/ui/skeleton/skeleton.js";
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
const FIXED_RATE_SEEK_THRESHOLD_S = 0.5;
const SEEK_REPORT_DEBOUNCE_MS = 350;
const ECHO_WINDOW_MS = 700;
const CORRECTION_COOLDOWN_MS = 3000;

export interface VideoPlayerFrameProps {
  playbackState: RoomPlaybackStateDto | null;
  getEstimatedServerNow: () => number;
  onUserAction?: (action: UserPlayerAction) => void;
  /** Without control permission, local actions in the player are undone instead of reported. */
  canControl?: boolean;
  /** This player stalled (true) or recovered (false); the room holds playback meanwhile. */
  onStallChange?: (stalled: boolean, position: number) => void;
  /** The room has waited long enough for stalled clients; ask the server to resume. */
  onWaitTimeout?: () => void;
  /** Extra delay before asking the server to end the wait (non-leaders act only as a fallback). */
  waitFallbackDelayMs?: number;
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
      onStallChange,
      onWaitTimeout,
      waitFallbackDelayMs = 0,
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
    const loadedMediaKeyRef = useRef<string | null>(null);
    // Latest props/state for handlers bound once at adapter creation
    const latest = useRef({
      errorText: t.room.playerError,
      playbackState,
      canControl,
      onStallChange,
      onWaitTimeout,
      waitFallbackDelayMs,
      getEstimatedServerNow,
      onUserAction,
      onPositionUpdate,
      onPlayStateChange,
      onBufferingChange,
    });
    latest.current = {
      errorText: t.room.playerError,
      playbackState,
      canControl,
      onStallChange,
      onWaitTimeout,
      waitFallbackDelayMs,
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
    const lastCorrectionRef = useRef(0);
    const seekReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastActionRef = useRef<{ type: UserPlayerAction["type"]; at: number } | null>(null);
    const handleLocalAction = (action: UserPlayerAction) => {
      // Players fire several events for one click (play + playing); report it once
      const prev = lastActionRef.current;
      if (prev && prev.type === action.type && Date.now() - prev.at < 700) return;
      lastActionRef.current = { type: action.type, at: Date.now() };
      const cur = latest.current;
      if (!cur.canControl) {
        revertRef.current();
        return;
      }
      if (action.type === "seek") {
        // Scrubbing fires a burst of jumps: report only where it settles
        if (seekReportTimerRef.current) clearTimeout(seekReportTimerRef.current);
        seekReportTimerRef.current = setTimeout(() => {
          seekReportTimerRef.current = null;
          latest.current.onUserAction?.(action);
        }, SEEK_REPORT_DEBOUNCE_MS);
        lastActionRef.current = null;
        return;
      }
      cur.onUserAction?.(action);
    };
    const revertRef = useRef<() => void>(() => {});

    // Stall tracking: a stall must last a moment before it holds the room
    const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const stalledRef = useRef(false);
    const readyPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const clearReadyPoll = () => {
      if (readyPollRef.current) {
        clearInterval(readyPollRef.current);
        readyPollRef.current = null;
      }
    };

    const reportRecovered = () => {
      clearReadyPoll();
      if (!stalledRef.current) return;
      stalledRef.current = false;
      latest.current.onStallChange?.(false, adapterRef.current?.getCurrentTime() ?? 0);
      // A follower whose player stalled fell behind a room that kept going: line up again right away
      setTimeout(() => revertRef.current(), 300);
    };

    // While the room waits, report "ready" as soon as enough is buffered (or after a short fallback)
    const startReadyPoll = () => {
      clearReadyPoll();
      const startedAt = Date.now();
      readyPollRef.current = setInterval(() => {
        const adapter = adapterRef.current;
        const ahead = adapter?.bufferedAhead?.();
        const hasProbe = typeof ahead === "number";
        const ready = hasProbe
          ? ahead >= BUFFER_READY_AHEAD_SECONDS
          : Date.now() - startedAt > 2500;
        if (ready || Date.now() - startedAt > BUFFER_WAIT_TIMEOUT_MS - 500) reportRecovered();
      }, 300);
    };

    const armGuard = () => {
      guardUntilRef.current = Date.now() + REMOTE_APPLY_GUARD_MS;
      lastSampleRef.current = null;
    };
    const isGuarded = () => Date.now() < guardUntilRef.current;

    // Events we cause ourselves (play/pause/seek issued to the player) are remembered and swallowed once.
    // This replaces a blanket "ignore everything for 800 ms", which also dropped genuine user clicks.
    const expectedRef = useRef<Array<{ type: "play" | "pause" | "seek"; target?: number; until: number }>>([]);
    const expectEvent = (type: "play" | "pause" | "seek", target?: number) => {
      const now = Date.now();
      expectedRef.current = expectedRef.current.filter((e) => e.until > now);
      expectedRef.current.push({ type, target, until: now + 1500 });
    };
    // Players often fire two events for one action (play + playing): once an expected event was swallowed,
    // its echo within a moment is swallowed too, so it cannot be mistaken for the user pressing the button.
    const lastConsumedRef = useRef<{ play: number; pause: number }>({ play: 0, pause: 0 });
    const consumeExpected = (type: "play" | "pause" | "seek", position?: number): boolean => {
      const now = Date.now();
      expectedRef.current = expectedRef.current.filter((e) => e.until > now);
      const i = expectedRef.current.findIndex(
        (e) => e.type === type && (type !== "seek" || Math.abs((position ?? 0) - (e.target ?? 0)) < 2.5)
      );
      if (i >= 0) {
        expectedRef.current.splice(i, 1);
        if (type !== "seek") lastConsumedRef.current[type] = now;
        return true;
      }
      return type !== "seek" && now - lastConsumedRef.current[type] < ECHO_WINDOW_MS;
    };

    const [overlayStatus, setOverlayStatus] = useState<string | null>(null);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [needsGesture, setNeedsGesture] = useState(false);
    const autoplayCheckRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useImperativeHandle(ref, () => ({
      play: async () => {
        expectEvent("play");
        await adapterRef.current?.play();
      },
      pause: async () => {
        expectEvent("pause");
        await adapterRef.current?.pause();
      },
      seek: async (sec: number) => {
        armGuard();
        expectEvent("seek", sec);
        await adapterRef.current?.seek(sec);
      },
      getCurrentTime: () => adapterRef.current?.getCurrentTime() || 0,
      getDuration: () => adapterRef.current?.getDuration() || 0,
    }));

  // Initialize or swap adapter when media type changes
  const doInitAdapter = useCallback(async (media: MediaSourceInfo | null) => {
    if (!containerRef.current) return;

    if (!media) {
      if (adapterRef.current) {
        adapterRef.current.destroy();
        adapterRef.current = null;
        currentMediaTypeRef.current = null;
        loadedMediaKeyRef.current = null;
      }
      return;
    }

    if (currentMediaTypeRef.current !== media.type) {
      if (adapterRef.current) {
        adapterRef.current.destroy();
      }
      loadedMediaKeyRef.current = null;

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
          if (event.duration > 0) setMediaLoading(false);

          // A discontinuity not caused by us is a seek made in the player's own UI
          const now = Date.now();
          const prev = lastSampleRef.current;
          lastSampleRef.current = { time: event.currentTime, wall: now };
          if (prev && server?.media) {
            const rate = adapterPlayingRef.current ? server.playbackRate : 0;
            const expectedDelta = ((now - prev.wall) / 1000) * rate;
            const jump = event.currentTime - prev.time - expectedDelta;
            if (Math.abs(jump) > USER_SEEK_JUMP_SECONDS && !consumeExpected("seek", event.currentTime)) {
              handleLocalAction({ type: "seek", position: event.currentTime });
            }
          }
        } else if (event.type === "play") {
          adapterPlayingRef.current = true;
          setNeedsGesture(false);
          cur.onBufferingChange?.(false);
          if (stallTimerRef.current) {
            clearTimeout(stallTimerRef.current);
            stallTimerRef.current = null;
          }
          reportRecovered();
          cur.onPlayStateChange?.(true);
          if (!consumeExpected("play") && server?.media && server.status !== PlaybackStatus.PLAYING) {
            handleLocalAction({ type: "play", position: event.currentTime });
          }
        } else if (event.type === "pause") {
          adapterPlayingRef.current = false;
          cur.onPlayStateChange?.(false);
          if (!consumeExpected("pause") && server?.media && server.status === PlaybackStatus.PLAYING) {
            handleLocalAction({ type: "pause", position: event.currentTime });
          }
        } else if (event.type === "ended") {
          adapterPlayingRef.current = false;
          cur.onPlayStateChange?.(false);
        } else if (event.type === "buffering") {
          cur.onBufferingChange?.(true);
          if (!isGuarded() && !stalledRef.current && !stallTimerRef.current && server?.status === PlaybackStatus.PLAYING) {
            stallTimerRef.current = setTimeout(() => {
              stallTimerRef.current = null;
              if (adapterRef.current?.isBuffering() && !stalledRef.current) {
                stalledRef.current = true;
                latest.current.onStallChange?.(true, adapterRef.current.getCurrentTime());
                startReadyPoll();
              }
            }, BUFFER_STALL_DEBOUNCE_MS);
          }
        } else if (event.type === "autoplay-blocked") {
          setNeedsGesture(true);
        } else if (event.type === "error") {
          setMediaLoading(false);
          setOverlayStatus(event.error || latest.current.errorText);
        }
      });
    }

    // Every state update carries a fresh `media` object; only a different video may reload the player
    const mediaKey = `${media.type}:${media.canonicalUrl}`;
    if (adapterRef.current && loadedMediaKeyRef.current !== mediaKey) {
      loadedMediaKeyRef.current = mediaKey;
      setMediaLoading(true);
      setOverlayStatus(null);
      await adapterRef.current.loadMedia(media);
      // The room state may have arrived long before the player existed (reload, late join):
      // line the freshly loaded player up with it now.
      revertRef.current();
    }
  }, []);

  // Initializations run strictly one after another: creating a player takes time, and two
  // overlapping runs (React dev double effects, quick media switches) would build two players.
  const initQueueRef = useRef<Promise<void>>(Promise.resolve());
  const initAdapter = useCallback(
    (media: MediaSourceInfo | null): Promise<void> => {
      initQueueRef.current = initQueueRef.current.then(() => doInitAdapter(media)).catch((err) => {
        console.error("Player failed to load:", err);
        setOverlayStatus(err instanceof Error ? err.message : t.room.playerError);
        setMediaLoading(false);
      });
      return initQueueRef.current;
    },
    [doInitAdapter, t]
  );

  // Handle media source changes
  const mediaKey = playbackState?.media ? `${playbackState.media.type}:${playbackState.media.canonicalUrl}` : null;
  useEffect(() => {
    initAdapter(playbackState?.media ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey, initAdapter]);

  // Handle mute changes
  useEffect(() => {
    if (adapterRef.current) {
      adapterRef.current.setMuted(isMuted);
    }
  }, [isMuted]);

  // Apply authoritative server state. Runs only when the server state changes,
  // never on local position ticks, and only touches the player when it differs.
  const joinPlayback = () => {
    const adapter = adapterRef.current;
    const state = latest.current.playbackState;
    if (!adapter || !state) return;
    setNeedsGesture(false);
    armGuard();
    const expected = calculateExpectedPosition(state, latest.current.getEstimatedServerNow());
    expectEvent("seek", expected);
    expectEvent("play");
    adapter.seek(expected).catch(() => {});
    adapter.play().catch(() => {});
  };

  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyServerState = useCallback(() => {
    const adapter = adapterRef.current;
    const state = latest.current.playbackState;
    if (!adapter || !state || !state.media) return;

    armGuard();
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current);
      startTimerRef.current = null;
    }

    const serverNow = latest.current.getEstimatedServerNow();
    const expected = calculateExpectedPosition(state, serverNow);

    if (appliedRateRef.current !== state.playbackRate) {
      appliedRateRef.current = state.playbackRate;
      adapter.setPlaybackRate(state.playbackRate).catch(() => {});
    }

    // Playback that starts at a future instant (group resume): line up now, start together
    const startsIn = state.anchorServerTime - serverNow;
    if (state.status === PlaybackStatus.PLAYING && startsIn > 30) {
      if (adapterPlayingRef.current) {
        expectEvent("pause");
        adapter.pause().catch(() => {});
      }
      if (Math.abs(adapter.getCurrentTime() - state.anchorPosition) > 0.3) {
        expectEvent("seek", state.anchorPosition);
        adapter.seek(state.anchorPosition).catch(() => {});
      }
      const revision = state.revision;
      startTimerRef.current = setTimeout(() => {
        startTimerRef.current = null;
        if (latest.current.playbackState?.revision !== revision) return;
        armGuard();
        expectEvent("play");
        adapter.play().catch(() => {});
      }, startsIn);
      return;
    }

    if (state.status === PlaybackStatus.PLAYING) {
      if (!adapterPlayingRef.current) {
        expectEvent("play");
        adapter.play().catch(() => {});
        // Browsers refuse to start media without a user gesture: say so instead of sitting silent
        if (autoplayCheckRef.current) clearTimeout(autoplayCheckRef.current);
      if (seekReportTimerRef.current) clearTimeout(seekReportTimerRef.current);
        autoplayCheckRef.current = setTimeout(() => {
          const live = latest.current.playbackState;
          if (live?.status === PlaybackStatus.PLAYING && !adapterPlayingRef.current) setNeedsGesture(true);
        }, 2500);
      }
    } else if (adapterPlayingRef.current) {
      // Paused, ended, or the room is holding for a stalled participant
      expectEvent("pause");
      adapter.pause().catch(() => {});
    }

    const target = state.status === PlaybackStatus.PLAYING ? expected : state.anchorPosition;
    if (Math.abs(adapter.getCurrentTime() - target) > SYNC_THRESHOLD_DRIFT_RATE_MS / 1000) {
      expectEvent("seek", target);
      adapter.seek(target).catch(() => {});
    }
  }, []);
  revertRef.current = applyServerState;

  const stateKey = playbackState
    ? `${playbackState.revision}:${playbackState.status}:${playbackState.anchorServerTime}:${playbackState.playbackRate}`
    : "";
  useEffect(() => {
    applyServerState();
  }, [stateKey, mediaKey, applyServerState]);

  // The room is holding for stalled clients: after the wait, ask the server to let go of the laggards.
  // Every client does this (with jitter); the server call is idempotent.
  const holdingRevision = playbackState?.status === PlaybackStatus.BUFFERING ? playbackState.revision : null;
  useEffect(() => {
    if (holdingRevision === null) return;
    const timer = setTimeout(
      () => latest.current.onWaitTimeout?.(),
      BUFFER_WAIT_TIMEOUT_MS + 300 + (latest.current.waitFallbackDelayMs ?? 0) + Math.random() * 400
    );
    return () => clearTimeout(timer);
  }, [holdingRevision]);

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
      const canNudge = adapter.fineRate !== false;
      // Sources that cannot be nudged get corrected by a (rate limited) seek at a lower threshold
      const seekThreshold = Math.max(
        canNudge ? SYNC_THRESHOLD_DRIFT_RATE_MS / 1000 : FIXED_RATE_SEEK_THRESHOLD_S,
        adapter.driftToleranceSeconds ?? 0
      );

      if (abs > seekThreshold) {
        if (Date.now() - lastCorrectionRef.current < CORRECTION_COOLDOWN_MS) return;
        lastCorrectionRef.current = Date.now();
        armGuard();
        expectEvent("seek", expected);
        adapter.seek(expected).catch(() => {});
        return;
      }

      if (!canNudge) return;
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
      if (autoplayCheckRef.current) clearTimeout(autoplayCheckRef.current);
      if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
      if (startTimerRef.current) clearTimeout(startTimerRef.current);
      clearReadyPoll();
      adapterRef.current?.destroy();
      adapterRef.current = null;
    };
  }, []);

  return (
    <div className={styles.playerFrame}>
      <div ref={containerRef} className={styles.adapterContainer} />

      {!playbackState?.media && (
        <div className={styles.placeholder}>
          <h3 className={styles.placeholderTitle}>{canControl ? t.room.standby : t.room.standbyViewer}</h3>
          <p className={styles.placeholderText}>
            {canControl ? t.room.standbyDesc : t.room.standbyViewerDesc}
          </p>
        </div>
      )}

      {mediaLoading && !overlayStatus && playbackState?.media && (
        <div className={styles.loadingOverlay} aria-hidden>
          <Skeleton width="100%" height="100%" />
        </div>
      )}

      {overlayStatus && (
        <div className={styles.overlayMessage}>
          {overlayStatus}
        </div>
      )}

      {needsGesture && (
        <button type="button" className={styles.gestureOverlay} onClick={joinPlayback}>
          <Play size={28} />
          <span>{t.room.tapToJoin}</span>
        </button>
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
