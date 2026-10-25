import React, { useEffect, useState, useCallback, useRef } from "react";
import { MessageSquare, Mic, Users, Share2, Film, X, ChevronLeft, ChevronRight, Maximize2, Minimize2, ShieldAlert } from "lucide-react";
import { useSession } from "../../../app/providers/session-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { RoomHeader } from "../../../widgets/room-header/ui/room-header.js";
import { VideoPlayerFrame, type VideoPlayerHandle } from "../../../widgets/video-player/ui/video-player-frame.js";
import { PlaybackControls } from "../../../shared/ui/playback-controls/playback-controls.js";
import { ChangeMediaInput } from "../../../features/change-media/ui/change-media-input.js";
import { RoomChat } from "../../../widgets/room-chat/ui/room-chat.js";
import { ParticipantsPanel } from "../../../widgets/participants-panel/ui/participants-panel.js";
import { VoicePanel } from "../../../widgets/voice-panel/ui/voice-panel.js";
import { InvitePanel } from "../../../widgets/invite-panel/ui/invite-panel.js";
import { ConnectionNotice } from "../../../shared/ui/connection-notice/connection-notice.js";
import { Button } from "../../../shared/ui/button/button.js";
import { ConfirmDialog } from "../../../shared/ui/confirm-dialog/confirm-dialog.js";
import { ReportModal } from "../../../widgets/report-modal/index.js";
import { ResizeHandle } from "../../../shared/ui/resize-handle/resize-handle.js";
import { useResizableWidth } from "../../../shared/lib/use-resizable-width.js";
import { availableRates } from "../../../shared/lib/adapters/playback-rates.js";
import { backend, generateClientRequestId } from "../../../shared/api/backend.js";
import { openRoomChannel, sendTyping, broadcastChatReaction, broadcastChatDeleted, type RoomChannelStatus } from "../../../shared/api/realtime.js";
import { showToast } from "../../../shared/ui/toast/toast.js";
import { clearStoredActiveRoom } from "../../../shared/lib/active-room.js";
import {
  PlaybackStatus,
  type ChatMessageDto,
  type RoomSnapshotDto,
  type RoomPlaybackStateDto,
  type PlayerCommandPayload,
  type MediaSourceInfo,
  type ControlMode,
} from "@omioroom/contracts";
import styles from "./room-page.module.scss";

type RoomTab = "chat" | "voice" | "participants" | "invite" | "media";

interface RoomPageProps {
  initialSnapshot: RoomSnapshotDto;
  ownerAccessKey?: string | null;
  onLeave: () => void;
  onNavigateHome: () => void;
  onNavigateMyRooms: () => void;
}

export const RoomPage: React.FC<RoomPageProps> = ({
  initialSnapshot,
  ownerAccessKey: initialKey,
  onLeave,
  onNavigateHome,
  onNavigateMyRooms,
}) => {
  const { connectionStatus: sessionStatus, timeSync, user } = useSession();
  const { t } = useI18n();

  const [snapshot, setSnapshot] = useState<RoomSnapshotDto>(initialSnapshot);
  const [playback, setPlayback] = useState<RoomPlaybackStateDto | null>(initialSnapshot.playback);
  const [ownerKey, setOwnerKey] = useState<string | null>(initialKey ?? null);
  const [codeRevoked, setCodeRevoked] = useState(false);
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [chatLoading, setChatLoading] = useState(true);
  const [channelStatus, setChannelStatus] = useState<RoomChannelStatus>("connecting");
  const [presentIds, setPresentIds] = useState<string[] | null>(null);
  // Who is typing right now: userId -> name. Entries expire on their own if the "stopped" signal is lost.
  const [typing, setTyping] = useState<Record<string, string>>({});
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Default to media picker if no video is loaded and user can control; otherwise chat
  const canControl = snapshot.canControl;
  const [activeTab, setActiveTab] = useState<RoomTab>(
    initialSnapshot.playback?.media ? "chat" : canControl ? "media" : "chat"
  );

  // Tab scroll navigation
  const tabBarRef = useRef<HTMLElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkTabScroll = useCallback(() => {
    const el = tabBarRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  const scrollTabs = (direction: "left" | "right") => {
    const el = tabBarRef.current;
    if (!el) return;
    const step = 150;
    el.scrollBy({ left: direction === "left" ? -step : step, behavior: "smooth" });
    setTimeout(checkTabScroll, 250);
  };

  const handleTabBarWheel = (e: React.WheelEvent<HTMLElement>) => {
    const el = tabBarRef.current;
    if (!el) return;
    if (e.deltaY !== 0 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      el.scrollLeft += e.deltaY;
      checkTabScroll();
    }
  };

  useEffect(() => {
    checkTabScroll();
    const el = tabBarRef.current;
    if (!el) return;
    const onResize = () => checkTabScroll();
    window.addEventListener("resize", onResize);
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => checkTabScroll());
      ro.observe(el);
    }
    return () => {
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
    };
  }, [checkTabScroll, canControl]);

  useEffect(() => {
    const el = tabBarRef.current;
    if (!el) return;
    const activeEl = el.querySelector<HTMLElement>(`.${styles.activeTab}`);
    if (activeEl) {
      activeEl.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
    }
    setTimeout(checkTabScroll, 150);
  }, [activeTab, checkTabScroll]);



  // Latest callbacks for the long-lived channel effect (they change identity on every parent render)
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const tRef = useRef(t);
  tRef.current = t;
  const mountTimeRef = useRef(Date.now());
  const playbackRef = useRef<RoomPlaybackStateDto | null>(initialSnapshot.playback);
  playbackRef.current = playback;
  const playbackRevisionRef = useRef(initialSnapshot.playback?.revision ?? 0);

  // Local player tracking state
  const [currentTime, setCurrentTime] = useState(initialSnapshot.playback?.anchorPosition || 0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);

  // Cinema mode: a CSS-only "fullscreen" (works on phones, where the Fullscreen API does not): big video,
  // chat as a resizable side panel that collapses into a round button
  const [cinema, setCinema] = useState(false);
  const [cinemaChatOpen, setCinemaChatOpen] = useState(true);

  // Mobile phone responsiveness:
  // - In portrait: floating chat circle collapses chat; clicking it opens full screen (due to lack of space).
  // - In landscape: chat opens half-screen by default, with option to toggle fullscreen.
  const [isMobile, setIsMobile] = useState(() =>
    typeof window !== "undefined" ? window.innerWidth <= 720 : false
  );
  const [isLandscape, setIsLandscape] = useState(() =>
    typeof window !== "undefined"
      ? window.innerWidth > window.innerHeight && (window.innerHeight <= 550 || window.innerWidth <= 920)
      : false
  );
  const [mobileChatOpen, setMobileChatOpen] = useState(false);
  const [mobileChatFullscreen, setMobileChatFullscreen] = useState(false);

  useEffect(() => {
    const updateViewport = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setIsMobile(w <= 720);
      setIsLandscape(w > h && (h <= 550 || w <= 920));
    };
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    updateViewport();
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  // Unread messages from others (starts from the server count, then grows while the chat is out of sight)
  const [unreadMessages, setUnreadMessages] = useState(initialSnapshot.unreadCount ?? 0);
  const chatVisibleRef = useRef(false);

  // Draggable floating chat button in cinema mode & mobile phone mode
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
  const [isDraggingFab, setIsDraggingFab] = useState(false);
  const dragRef = useRef<{
    isDragging: boolean;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    hasMoved: boolean;
  }>({
    isDragging: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
    hasMoved: false,
  });

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    setIsDraggingFab(true);
    const currentX = fabPos?.x ?? (window.innerWidth - 68);
    const currentY = fabPos?.y ?? (window.innerHeight - 76);
    dragRef.current = {
      isDragging: true,
      startX: e.clientX,
      startY: e.clientY,
      origX: currentX,
      origY: currentY,
      hasMoved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.isDragging) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.hypot(dx, dy) > 4) {
      dragRef.current.hasMoved = true;
    }
    const nextX = Math.max(8, Math.min(window.innerWidth - 60, dragRef.current.origX + dx));
    const nextY = Math.max(8, Math.min(window.innerHeight - 60, dragRef.current.origY + dy));
    setFabPos({ x: nextX, y: nextY });
  };

  const onFabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragRef.current.isDragging) return;
    dragRef.current.isDragging = false;
    setIsDraggingFab(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (!dragRef.current.hasMoved) {
      if (isMobile) {
        setMobileChatOpen(true);
      } else {
        setCinemaChatOpen(true);
      }
    }
  };
  const chatSize = useResizableWidth(
    "omioroom_chat_width",
    Math.min(420, Math.round(window.innerWidth * 0.38)),
    280,
    640
  );

  // Leaving the room by any route goes through a confirmation: the seat is freed only on a real exit
  const [pendingExit, setPendingExit] = useState<"home" | "my-rooms" | "leave" | null>(null);
  const pendingExitRef = useRef(pendingExit);
  pendingExitRef.current = pendingExit;

  const isPlaying = playback?.status === PlaybackStatus.PLAYING;
  const isLocalCommandRef = useRef(false);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  const prevTabRef = useRef<RoomTab>(activeTab);

  const handleToggleCinema = useCallback(() => {
    setCinema((on) => {
      if (!on) {
        prevTabRef.current = activeTab;
        setActiveTab("chat");
        setCinemaChatOpen(window.innerWidth > 720);
      } else {
        setActiveTab(prevTabRef.current || "chat");
      }
      return !on;
    });
  }, [activeTab]);

  // Keyboard accessibility:
  // F - Fullscreen / Cinema toggle
  // C - Chat toggle
  // Space - Play / Pause (if canControl)
  // Left/Right - Seek 10s (if canControl)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable;

      // Browser and system shortcuts (copy, find, reload...) must keep working
      if (isInput || e.ctrlKey || e.metaKey || e.altKey) return;

      // F or Russian А (fullscreen / cinema toggle)
      if (e.code === "KeyF" || e.key.toLowerCase() === "f" || e.key.toLowerCase() === "а") {
        e.preventDefault();
        handleToggleCinema();
        return;
      }

      // C or Russian С (chat toggle)
      if (e.code === "KeyC" || e.key.toLowerCase() === "c" || e.key.toLowerCase() === "с") {
        e.preventDefault();
        if (cinema) {
          setCinemaChatOpen((open) => !open);
        } else {
          setActiveTab("chat");
          const input = document.querySelector<HTMLInputElement>('[data-widget="room-chat"] input');
          input?.focus();
        }
        return;
      }

      if (!canControl) return;

      if (e.code === "Space") {
        e.preventDefault();
        if (isPlaying) {
          handlePause();
        } else {
          handlePlay();
        }
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        handleSeek(Math.max(0, currentTime - 10), true);
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(Math.min(duration || Infinity, currentTime + 10), true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, currentTime, duration, canControl, cinema, handleToggleCinema]);

  // Applies a playback state: server is the single source of truth.
  // Revisions are respected, but forced updates (from server getSnapshot) or media changes are always applied.
  const applyPlayback = useCallback((state: RoomPlaybackStateDto, force = false) => {
    if (!force) {
      const isSameVideo =
        state.media?.canonicalUrl === playbackRef.current?.media?.canonicalUrl &&
        state.media?.type === playbackRef.current?.media?.type;
      if (isSameVideo && state.revision < playbackRevisionRef.current) {
        return;
      }
    }
    playbackRevisionRef.current = state.revision;
    setPlayback(state);
  }, []);

  // Realtime: one channel per room. On every (re)subscription reload the authoritative snapshot.
  useEffect(() => {
    if (!user) return;
    const roomId = initialSnapshot.room.id;
    let disposed = false;

    // Snapshot only: who is here and what the room allows
    const reloadSnapshot = async () => {
      try {
        const fresh = await backend.getSnapshot(roomId);
        if (disposed) return;
        setSnapshot(fresh);
        if (fresh.playback) applyPlayback(fresh.playback, true);
      } catch (err: any) {
        if (!disposed && (err?.code === "ROOM_NOT_FOUND" || err?.code === "FORBIDDEN")) onLeaveRef.current();
      }
    };

    // Authoritative snapshot on entry / reload
    void reloadSnapshot();

    // Snapshot plus chat history: only when (re)subscribing, i.e. when events may have been missed
    const reloadAll = async () => {
      await reloadSnapshot();
      try {
        const history = await backend.chatHistory(roomId);
        if (disposed) return;
        setMessages(history);
      } catch {
        // The next resync retries
      } finally {
        if (!disposed) setChatLoading(false);
      }
    };

    // Joins and setting changes reach every participant at once. Merge bursts into one request and
    // spread the clients over a short window, so a big room does not hit the database in the same instant.
    let snapshotTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleSnapshot = () => {
      if (snapshotTimer) clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(() => {
        snapshotTimer = null;
        void reloadSnapshot();
      }, 300 + Math.random() * 1500);
    };

    const close = openRoomChannel(roomId, user.id, {
      onPlayback: applyPlayback,
      onTyping: ({ userId: tUserId, name, typing: isTyping }) => {
        if (tUserId === user.id) return;
        clearTimeout(typingTimers.current[tUserId]);
        if (!isTyping) {
          setTyping((prev) => {
            const { [tUserId]: _gone, ...rest } = prev;
            return rest;
          });
          return;
        }
        setTyping((prev) => (prev[tUserId] === name ? prev : { ...prev, [tUserId]: name }));
        typingTimers.current[tUserId] = setTimeout(() => {
          setTyping((prev) => {
            const { [tUserId]: _gone, ...rest } = prev;
            return rest;
          });
        }, 5000);
      },
      onChat: (msg) => {
        // A sent message ends that person's "typing"
        clearTimeout(typingTimers.current[msg.senderId]);
        setTyping((prev) => {
          if (!(msg.senderId in prev)) return prev;
          const { [msg.senderId]: _gone, ...rest } = prev;
          return rest;
        });
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].slice(-100)));
        if (msg.senderId !== user.id && !chatVisibleRef.current) setUnreadMessages((n) => n + 1);
      },
      onChatUpdated: (msg) => {
        setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
      },
      onChatDeleted: (deletedId) => {
        setMessages((prev) => prev.filter((m) => m.id !== deletedId));
      },
      onReactionBroadcast: ({ messageId, emoji, userId: rUserId, action }) => {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== messageId) return m;
            const currentList = m.reactions?.[emoji] ?? [];
            const hasUser = currentList.includes(rUserId);
            let nextList: string[];
            if (action === "add" && !hasUser) {
              nextList = [...currentList, rUserId];
            } else if (action === "remove" && hasUser) {
              nextList = currentList.filter((u) => u !== rUserId);
            } else {
              return m;
            }
            const nextReactions = { ...m.reactions };
            if (nextList.length === 0) {
              delete nextReactions[emoji];
            } else {
              nextReactions[emoji] = nextList;
            }
            return { ...m, reactions: nextReactions };
          })
        );
      },
      onChatSeen: (uid, seenAt) =>
        setSnapshot((prev) => ({
          ...prev,
          participants: prev.participants.map((p) => (p.userId === uid ? { ...p, chatSeenAt: seenAt } : p)),
        })),
      onRoomChanged: (row) => {
        if (row.status === "closed") {
          clearStoredActiveRoom();
          showToast(tRef.current.room.roomClosedNotice, { id: "room-ended" });
          onLeaveRef.current();
          return;
        }
        setSnapshot((prev) => ({
          ...prev,
          room: {
            ...prev.room,
            visibility: row.visibility,
            revision: row.revision,
            maxParticipants: row.maxParticipants,
            controlMode: row.controlMode,
          },
        }));
        scheduleSnapshot();
      },
      onMemberChanged: scheduleSnapshot,
      onPresence: setPresentIds,
      onStatus: setChannelStatus,
      onResync: () => void reloadAll(),
    });

    const runHeartbeat = async () => {
      if (disposed) return;
      try {
        const state = await backend.heartbeatRoom(roomId);
        if (disposed) return;
        if (state === "OK") return;
        if (state === "ROOM_CLOSED" || state === "ROOM_NOT_FOUND") {
          clearStoredActiveRoom();
          showToast(tRef.current.room.roomClosedNotice, { id: "room-ended" });
          onLeaveRef.current();
        } else if (state === "BANNED") {
          clearStoredActiveRoom();
          showToast(tRef.current.room.bannedNotice, { id: "room-banned" });
          onLeaveRef.current();
        } else if (state === "ROOM_FULL") {
          // Our seat was taken while we were away
          clearStoredActiveRoom();
          showToast(tRef.current.home.errors.roomFull, { id: "room-full" });
          onLeaveRef.current();
        } else if (state === "NOT_MEMBER") {
          if (initialSnapshot.room.visibility === "public") {
            try {
              await backend.joinRoom(initialSnapshot.room.globalId);
            } catch {
              clearStoredActiveRoom();
              showToast(tRef.current.room.notMemberNotice, { id: "room-not-member" });
              onLeaveRef.current();
            }
          } else {
            clearStoredActiveRoom();
            showToast(tRef.current.room.notMemberNotice, { id: "room-not-member" });
            onLeaveRef.current();
          }
        }
      } catch {}
    };

    // Heartbeat every 45 seconds, on tab visibility return, and when coming back online
    const heartbeatTimer = setInterval(() => void runHeartbeat(), 45_000);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void reloadSnapshot();
        void runHeartbeat();
      }
    };
    const onOnline = () => {
      void reloadSnapshot();
      void runHeartbeat();
    };

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("online", onOnline);
    const onPageHide = () => void backend.leaveRoom(roomId).catch(() => {});
    window.addEventListener("pagehide", onPageHide);

    return () => {
      disposed = true;
      if (snapshotTimer) clearTimeout(snapshotTimer);
      clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pagehide", onPageHide);
      close();
    };
  }, [user, initialSnapshot.room.id, applyPlayback]);

  // Browser "Back" and closing the tab ask before dropping out of the room
  useEffect(() => {
    if (window.history.state?.omioroom !== "room") {
      window.history.pushState({ omioroom: "room" }, "");
    }
    const onPopState = () => {
      if (pendingExitRef.current) return;
      setPendingExit("leave");
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, []);

  const cancelExit = () => {
    setPendingExit(null);
    // The browser already stepped back: put the room entry back so "Back" keeps asking
    if (window.history.state?.omioroom !== "room") window.history.pushState({ omioroom: "room" }, "");
  };

  const confirmExit = async () => {
    const target = pendingExit;
    setPendingExit(null);
    clearStoredActiveRoom();
    try {
      await backend.leaveRoom(snapshot.room.id);
    } catch {
      // The seat expires on its own
    }
    if (target === "my-rooms") onNavigateMyRooms();
    else if (target === "home") onNavigateHome();
    else onLeave();
  };

  // Report modal state
  const [reportTarget, setReportTarget] = useState<{ messageId?: string } | null>(null);

  const handleReportSubmit = async (reasonText: string) => {
    await backend.reportRoom(snapshot.room.id, reasonText, reportTarget?.messageId);
    showToast(tRef.current.report.thanks, { id: "report-success" });
  };

  // Command sender helper
  const sendPlayerCommand = useCallback(
    async (partialPayload: Omit<PlayerCommandPayload, "commandId" | "roomId">): Promise<boolean> => {
      isLocalCommandRef.current = true;
      try {
        const updatedState = await backend.playerCommand({
          ...partialPayload,
          commandId: generateClientRequestId(),
          roomId: snapshot.room.id,
        });
        applyPlayback(updatedState);
        return true;
      } catch (err: any) {
        const isAlreadyLoaded =
          err?.code === "MEDIA_ALREADY_LOADED" ||
          err?.message === "MEDIA_ALREADY_LOADED" ||
          (typeof err?.message === "string" && err.message.includes("MEDIA_ALREADY_LOADED"));

        const isNotAllowedInOpenRoom =
          err?.code === "MEDIA_NOT_ALLOWED_IN_OPEN_ROOM" ||
          err?.message === "MEDIA_NOT_ALLOWED_IN_OPEN_ROOM" ||
          (typeof err?.message === "string" && err.message.includes("MEDIA_NOT_ALLOWED_IN_OPEN_ROOM"));

        const isCooldown =
          err?.code === "MEDIA_COOLDOWN" ||
          err?.message === "MEDIA_COOLDOWN" ||
          (typeof err?.message === "string" && err.message.includes("MEDIA_COOLDOWN"));

        const isUnsupported =
          err?.code === "MEDIA_UNSUPPORTED" ||
          err?.message === "MEDIA_UNSUPPORTED" ||
          (typeof err?.message === "string" && err.message.includes("MEDIA_UNSUPPORTED"));

        if (isAlreadyLoaded) {
          showToast(tRef.current.room.mediaAlreadyLoaded, { id: "media-already-loaded" });
        } else if (isNotAllowedInOpenRoom) {
          showToast(tRef.current.room.mediaNotAllowedInOpenRoom, { id: "media-not-allowed-in-open-room" });
        } else if (isCooldown) {
          showToast(tRef.current.room.mediaCooldown, { id: "media-cooldown" });
        } else if (isUnsupported) {
          showToast(tRef.current.room.mediaUnsupportedToast, { id: "media-unsupported" });
        } else {
          showToast(tRef.current.room.commandFailed, { id: "player-cmd-error" });
        }
        setPendingRate(null);
        if (playback) {
          setCurrentTime(playback.anchorPosition);
        }
        return false;
      } finally {
        setTimeout(() => {
          isLocalCommandRef.current = false;
        }, 200);
      }
    },
    [snapshot.room.id, applyPlayback, playback]
  );

  const handlePlay = () => {
    videoPlayerRef.current?.play();
    sendPlayerCommand({
      type: "play",
      position: currentTime,
    });
  };

  const handlePause = () => {
    videoPlayerRef.current?.pause();
    sendPlayerCommand({
      type: "pause",
      position: currentTime,
    });
  };

  const seekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSeek = (pos: number, immediate = false) => {
    setCurrentTime(pos);
    if (seekTimerRef.current) {
      clearTimeout(seekTimerRef.current);
      seekTimerRef.current = null;
    }
    if (immediate) {
      videoPlayerRef.current?.seek(pos);
      sendPlayerCommand({ type: "seek", position: pos });
    } else {
      seekTimerRef.current = setTimeout(() => {
        seekTimerRef.current = null;
        videoPlayerRef.current?.seek(pos);
        sendPlayerCommand({ type: "seek", position: pos });
      }, 250);
    }
  };

  // The speed picker answers at once; the room state confirms it (or takes it back if the command fails)
  const [pendingRate, setPendingRate] = useState<number | null>(null);
  const handleRateChange = (rate: number) => {
    setPendingRate(rate);
    void sendPlayerCommand({ type: "set-rate", playbackRate: rate }).finally(() => setPendingRate(null));
  };

  const handleMediaSelect = async (media: MediaSourceInfo): Promise<boolean> => {
    const success = await sendPlayerCommand({
      type: "change-media",
      media,
    });
    if (success) {
      // Immediately switch to chat once media is selected
      setActiveTab("chat");
      return true;
    }
    return false;
  };

  const handleRotatePrivateCode = async () => {
    const res = await backend.rotatePrivateCode(snapshot.room.id);
    setOwnerKey(res.privateCode);
    setCodeRevoked(false);
  };

  const handleRevokePrivateCode = async () => {
    await backend.revokePrivateCode(snapshot.room.id);
    setOwnerKey(null);
    setCodeRevoked(true);
  };

  const handleToggleVisibility = async (newVis: "public" | "private") => {
    const res = await backend.setVisibility(snapshot.room.id, newVis);
    setSnapshot((prev) => ({ ...prev, room: { ...prev.room, visibility: newVis, revision: res.room.revision } }));
    setCodeRevoked(false);
    setOwnerKey(res.ownerAccess ? res.ownerAccess.privateCode : null);
  };

  const handleSaveSettings = async (maxParticipants: number, controlMode: ControlMode) => {
    const room = await backend.updateRoomSettings(snapshot.room.id, maxParticipants, controlMode);
    setSnapshot((prev) => ({ ...prev, room: { ...prev.room, ...room } }));
  };

  const handleToggleControl = async (userId: string, canControl: boolean) => {
    setSnapshot((prev) => ({
      ...prev,
      participants: prev.participants.map((p) => (p.userId === userId ? { ...p, canControl } : p)),
    }));
    try {
      await backend.setMemberControl(snapshot.room.id, userId, canControl);
    } catch {
      setSnapshot(await backend.getSnapshot(snapshot.room.id));
    }
  };

  const handleToggleMuteMember = async (targetUserId: string, muted: boolean) => {
    const prevMuted = snapshot.mutedUserIds ?? [];
    const nextMuted = muted
      ? Array.from(new Set([...prevMuted, targetUserId]))
      : prevMuted.filter((id) => id !== targetUserId);

    setSnapshot((prev) => ({
      ...prev,
      mutedUserIds: nextMuted,
    }));

    try {
      await backend.setMemberMuted(snapshot.room.id, targetUserId, muted);
    } catch {
      setSnapshot((prev) => ({
        ...prev,
        mutedUserIds: prevMuted,
      }));
      showToast(tRef.current.room.commandFailed, { id: "mute-member-error" });
    }
  };

  const handleTypingChange = useCallback(
    (isTyping: boolean) => {
      if (!user) return;
      sendTyping(snapshot.room.id, { userId: user.id, name: user.displayName, typing: isTyping });
    },
    [user, snapshot.room.id]
  );

  const handleSendChat = async (text: string, image: File | null) => {
    const path = image ? await backend.uploadChatImage(snapshot.room.id, image) : null;
    await backend.sendChat(snapshot.room.id, text, path);
  };

  const handleToggleReaction = useCallback(
    async (messageId: string, emoji: string) => {
      if (!user) return;
      const targetMsg = messages.find((m) => m.id === messageId);
      const currentList = targetMsg?.reactions?.[emoji] ?? [];
      const hasUser = currentList.includes(user.id);
      const action = hasUser ? "remove" : "add";

      // Optimistic update
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== messageId) return m;
          const list = m.reactions?.[emoji] ?? [];
          const next = action === "add" ? [...list, user.id] : list.filter((id) => id !== user.id);
          const nextReactions = { ...m.reactions };
          if (next.length === 0) {
            delete nextReactions[emoji];
          } else {
            nextReactions[emoji] = next;
          }
          return { ...m, reactions: nextReactions };
        })
      );

      // Broadcast immediately to room channel
      broadcastChatReaction(snapshot.room.id, {
        messageId,
        emoji,
        userId: user.id,
        action,
      });

      // Persist in backend
      try {
        await backend.toggleReaction(snapshot.room.id, messageId, emoji);
      } catch (err) {
        console.error("Failed to persist reaction:", err);
      }
    },
    [user, messages, snapshot.room.id]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: string) => {
      // Optimistic update
      setMessages((prev) => prev.filter((m) => m.id !== messageId));

      // Broadcast immediately
      broadcastChatDeleted(snapshot.room.id, messageId);

      // Persist in backend
      try {
        await backend.deleteMessage(snapshot.room.id, messageId);
        showToast(tRef.current.chat.deletedNotice, { id: "msg-deleted" });
      } catch (err) {
        console.error("Failed to delete message:", err);
        void backend.chatHistory(snapshot.room.id).then(setMessages).catch(() => {});
      }
    },
    [snapshot.room.id]
  );


  // Cinema: Escape leaves it (unless a dialog is open), the page behind does not scroll
  useEffect(() => {
    if (!cinema) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pendingExitRef.current) setCinema(false);
    };
    window.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.overflow = prevOverflow;
    };
  }, [cinema]);

  // Unread counter for the collapsed chat button
  const chatVisible = cinema
    ? (isMobile ? mobileChatOpen : cinemaChatOpen)
    : activeTab === "chat";
  chatVisibleRef.current = chatVisible;
  useEffect(() => {
    if (chatVisible) setUnreadMessages(0);
  }, [chatVisible, messages.length]);
  // Only people who have the chat in front of them see who is typing
  const [pageVisible, setPageVisible] = useState(() => typeof document === "undefined" || document.visibilityState === "visible");
  useEffect(() => {
    const onVis = () => setPageVisible(document.visibilityState === "visible");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const typingNames = chatVisible && pageVisible ? Object.values(typing) : [];
  const unreadLabel = unreadMessages > 99 ? "99+" : String(unreadMessages);

  // Presence is live; fall back to the seat state from the database until it syncs
  const participants = snapshot.participants.map((p) => ({
    ...p,
    isOnline: presentIds ? presentIds.includes(p.userId) : p.isOnline,
  }));
  const activeParticipantsCount = participants.filter((p) => p.isOnline).length;
  const isCurrentUserMuted = Boolean(user?.id && snapshot.mutedUserIds?.includes(user.id));

  useEffect(() => {
    if (!canControl && activeTab === "media") setActiveTab("chat");
  }, [canControl, activeTab]);

  const lastActor = playback?.updatedByUserId ?? null;
  const leaderPresent = lastActor !== null && (presentIds === null || presentIds.includes(lastActor));
  const leaderId = leaderPresent ? lastActor : snapshot.room.ownerUserId;
  const isLeader = user?.id === leaderId;
  const waitingNames = (playback?.bufferingBy ?? [])
    .map((id) => participants.find((p) => p.userId === id)?.displayName)
    .filter((name): name is string => Boolean(name));

  return (
    <div
      className={styles.roomContainer}
      data-layout="room-page"
      data-cinema={cinema ? "true" : undefined}
    >
      {sessionStatus === "connected" && <ConnectionNotice status={channelStatus} />}
      <RoomHeader
        participantCount={activeParticipantsCount}
        maxParticipants={snapshot.room.maxParticipants}
        isOwner={snapshot.isOwner}
        roomNumber={snapshot.room.globalId}
        onNavigateHome={() => setPendingExit("home")}
        onNavigateMyRooms={() => setPendingExit("my-rooms")}
        onLeave={() => setPendingExit("leave")}
        onOpenParticipants={() => setActiveTab("participants")}
        onReportRoom={!snapshot.isOwner ? () => setReportTarget({}) : undefined}
      />

      <main
        className={styles.mainContent}
        data-layout="room-main"
        data-cinema={cinema ? "true" : undefined}
        data-chat-open={cinemaChatOpen ? "true" : "false"}
        style={{ "--chat-width": `${chatSize.width}px` } as React.CSSProperties}
      >
        {/* Cinematic Video Player Section */}
        <div className={styles.videoSection} ref={videoSectionRef} data-layout="room-video">
          <VideoPlayerFrame
            ref={videoPlayerRef}
            playbackState={playback}
            getEstimatedServerNow={() => timeSync.getEstimatedServerNow()}
            canControl={canControl}
            waitFallbackDelayMs={isLeader ? 0 : 4000}
            onStallChange={(stalled, position) =>
              isLeader &&
              void backend
                .reportBuffering(snapshot.room.id, stalled, position)
                .then(applyPlayback)
                .catch(() => {})
            }
            onWaitTimeout={() =>
              void backend
                .resolveBuffering(snapshot.room.id)
                .then((state) => state && applyPlayback(state))
                .catch(() => {})
            }
            onUserAction={(action) => {
              // During the first 3 seconds after entering or reloading, do not send player events to server
              if (Date.now() - mountTimeRef.current < 3000) {
                return;
              }
              sendPlayerCommand({ type: action.type, position: action.position });
            }}
            onPositionUpdate={(curr, dur) => {
              setCurrentTime(curr);
              if (dur > 0) setDuration(dur);
            }}
            isMuted={isMuted}
            onBufferingChange={setIsBuffering}
            isBuffering={isBuffering}
            bufferingNames={waitingNames}
            onToggleMute={() => setIsMuted((m) => !m)}
            participants={participants}
            currentUserId={user?.id}
          />

          <PlaybackControls
            isPlaying={isPlaying}
            currentTime={currentTime}
            duration={duration}
            playbackRate={pendingRate ?? (playback?.playbackRate || 1.0)}
            rates={availableRates(playback?.media?.type)}
            isMuted={isMuted}
            disabled={!playback?.media || !canControl}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRateChange={handleRateChange}
            onToggleMute={() => setIsMuted((m) => !m)}
            onToggleCinema={handleToggleCinema}
            cinema={cinema}
            pausedByName={
              !isPlaying && playback?.updatedByUserId
                ? user?.id === playback.updatedByUserId
                  ? t.room.you
                  : participants.find((p) => p.userId === playback.updatedByUserId)?.displayName ?? null
                : null
            }
          />

          {!playback?.media && (
            <div className={styles.videoPlaceholder}>
              {playback?.mediaBlocked ? (
                <div className={styles.mediaBlockedNotice}>
                  <div className={styles.mediaBlockedIcon}>
                    <ShieldAlert size={26} />
                  </div>
                  <span className={styles.mediaBlockedText}>
                    {playback.mediaBlocked === "unverifiable"
                      ? t.room.mediaBlockedUnverifiable
                      : t.room.mediaBlockedGeneral}
                  </span>
                  {canControl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Film size={14} />}
                      onClick={() => setActiveTab("media")}
                    >
                      {t.room.chooseAnotherMedia}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <span>{canControl ? t.room.addVideoFirst : t.room.standbyViewer}</span>
                  {canControl && (
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Film size={14} />}
                      onClick={() => setActiveTab("media")}
                    >
                      {t.room.standby}
                    </Button>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Sidebar Controls Section: universal tabs and focused active panel */}
        <aside
          className={styles.sidebarSection}
          data-layout="room-sidebar"
          data-active-tab={activeTab}
        >
          <ResizeHandle
            label={t.room.chatResize}
            value={chatSize.width}
            min={chatSize.min}
            max={chatSize.max}
            onDragStart={chatSize.startDrag}
            onNudge={chatSize.nudge}
            className={styles.resizeHandle}
          />
          {/* In cinema mode: show ONLY clean chat title and close button (no tabs!) */}
          {cinema ? (
            <div className={styles.cinemaSidebarHeader}>
              <div className={styles.cinemaChatTitle}>
                <MessageSquare size={16} />
                <span>{t.chat.title}</span>
              </div>
              <button
                type="button"
                className={styles.sidebarCloseBtn}
                onClick={() => setCinemaChatOpen(false)}
                aria-label={t.room.chatClose}
                title={t.room.chatClose}
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className={styles.sidebarHeader} data-layout="room-tabs">
              <div className={styles.tabNavWrapper}>
                <button
                  type="button"
                  className={`${styles.tabScrollArrow} ${styles.tabScrollArrowLeft}`}
                  onClick={() => scrollTabs("left")}
                  disabled={!canScrollLeft}
                  aria-label={t.room.tabScrollLeft}
                  title={t.room.tabScrollLeft}
                >
                  <ChevronLeft size={16} />
                </button>

                <nav
                  ref={tabBarRef}
                  className={styles.tabBar}
                  role="tablist"
                  aria-label="Room sections"
                  onScroll={checkTabScroll}
                  onWheel={handleTabBarWheel}
                >
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "chat"}
                    className={`${styles.tabBtn} ${activeTab === "chat" ? styles.activeTab : ""}`}
                    onClick={() => setActiveTab("chat")}
                  >
                    <MessageSquare size={14} />
                    <span>{t.room.tabChat}</span>
                    {unreadMessages > 0 && activeTab !== "chat" && <span className={styles.tabBadge}>{unreadLabel}</span>}
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "voice"}
                    className={`${styles.tabBtn} ${activeTab === "voice" ? styles.activeTab : ""}`}
                    onClick={() => setActiveTab("voice")}
                  >
                    <Mic size={14} />
                    <span>{t.room.tabVoice}</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "participants"}
                    className={`${styles.tabBtn} ${activeTab === "participants" ? styles.activeTab : ""}`}
                    onClick={() => setActiveTab("participants")}
                  >
                    <Users size={14} />
                    <span>{t.room.tabParticipants}</span>
                    <span className={styles.tabBadge}>{activeParticipantsCount}</span>
                  </button>

                  <button
                    type="button"
                    role="tab"
                    aria-selected={activeTab === "invite"}
                    className={`${styles.tabBtn} ${activeTab === "invite" ? styles.activeTab : ""}`}
                    onClick={() => setActiveTab("invite")}
                  >
                    <Share2 size={14} />
                    <span>{t.room.tabInvite}</span>
                  </button>

                  {canControl && (
                    <button
                      type="button"
                      role="tab"
                      aria-selected={activeTab === "media"}
                      className={`${styles.tabBtn} ${activeTab === "media" ? styles.activeTab : ""}`}
                      onClick={() => setActiveTab("media")}
                    >
                      <Film size={14} />
                      <span>{t.room.tabMedia}</span>
                    </button>
                  )}
                </nav>

                <button
                  type="button"
                  className={`${styles.tabScrollArrow} ${styles.tabScrollArrowRight}`}
                  onClick={() => scrollTabs("right")}
                  disabled={!canScrollRight}
                  aria-label={t.room.tabScrollRight}
                  title={t.room.tabScrollRight}
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Active Panel Content */}
          <div className={styles.panelsContainer}>
            {canControl && (
              <div data-panel="media" className={styles.panelWrapper}>
                <ChangeMediaInput
                  onMediaSelect={handleMediaSelect}
                  currentMedia={playback?.media}
                  isOpenRoom={snapshot.room.visibility === "public"}
                />
              </div>
            )}

            <div data-panel="voice" className={styles.panelWrapper}>
              <VoicePanel
                roomId={snapshot.room.id}
                userId={user?.id}
                participants={participants}
                mutedUserIds={snapshot.mutedUserIds}
              />
            </div>

            <div data-panel="chat" className={styles.panelWrapper}>
              <RoomChat
                messages={messages}
                loading={chatLoading}
                onSend={handleSendChat}
                participants={participants}
                roomId={snapshot.room.id}
                isMuted={isCurrentUserMuted}
                onReportMessage={(messageId) => setReportTarget({ messageId })}
                onToggleReaction={handleToggleReaction}
                onDeleteMessage={handleDeleteMessage}
                isOwner={snapshot.isOwner}
                canControl={canControl}
                typingNames={typingNames}
                onTypingChange={handleTypingChange}
              />
            </div>

            <div data-panel="participants" className={styles.panelWrapper}>
              <ParticipantsPanel
                participants={participants}
                currentUserId={user?.id}
                isOwner={snapshot.isOwner}
                canControl={snapshot.canControl}
                mutedUserIds={snapshot.mutedUserIds}
                maxParticipants={snapshot.room.maxParticipants}
                controlMode={snapshot.room.controlMode}
                bannedUsers={snapshot.bannedUsers}
                onSaveSettings={handleSaveSettings}
                onToggleControl={handleToggleControl}
                onToggleMute={handleToggleMuteMember}
                onKickMember={async (uid) => {
                  await backend.kickMember(snapshot.room.id, uid);
                }}
                onBanMember={async (uid) => {
                  await backend.banMember(snapshot.room.id, uid);
                }}
                onUnbanMember={async (uid) => {
                  setSnapshot((prev) => ({
                    ...prev,
                    bannedUsers: (prev.bannedUsers ?? []).filter((b) => b.userId !== uid),
                  }));
                  try {
                    await backend.unbanUser(uid);
                  } catch (err) {
                    setSnapshot(await backend.getSnapshot(snapshot.room.id));
                    throw err;
                  }
                }}
              />
            </div>

            <div data-panel="invite" className={styles.panelWrapper}>
              <InvitePanel
                globalRoomId={snapshot.room.globalId}
                isOwner={snapshot.isOwner}
                visibility={snapshot.room.visibility}
                privateCode={ownerKey}
                codeRevoked={codeRevoked}
                onRevokeCode={handleRevokePrivateCode}
                onRotateCode={handleRotatePrivateCode}
                onToggleVisibility={handleToggleVisibility}
              />
            </div>
          </div>
        </aside>

        {cinema && !cinemaChatOpen && (
          <button
            type="button"
            className={`${styles.chatFab} ${unreadMessages > 0 ? styles.chatFabHasUnread : ""}`}
            data-dragging={isDraggingFab ? "true" : "false"}
            style={
              fabPos
                ? ({ left: `${fabPos.x}px`, top: `${fabPos.y}px`, right: "auto", bottom: "auto" } as React.CSSProperties)
                : undefined
            }
            onPointerDown={onFabPointerDown}
            onPointerMove={onFabPointerMove}
            onPointerUp={onFabPointerUp}
            onPointerCancel={onFabPointerUp}
            onClick={() => {
              if (dragRef.current.hasMoved) return;
              if (isMobile) {
                setMobileChatOpen(true);
              } else {
                setCinemaChatOpen(true);
              }
            }}
            aria-label={t.room.chatOpen}
            title={t.room.chatOpen}
          >
            <MessageSquare size={22} />
            {unreadMessages > 0 && <span key={unreadMessages} className={styles.chatFabBadge}>{unreadLabel}</span>}
          </button>
        )}

        {isMobile && mobileChatOpen && (
          <div
            className={styles.mobileChatOverlay}
            data-landscape={isLandscape ? "true" : "false"}
            data-fullscreen={mobileChatFullscreen ? "true" : "false"}
            role="dialog"
            aria-modal="true"
            aria-label={t.chat.title}
          >
            <div className={styles.mobileChatHeader}>
              <div className={styles.mobileChatTitle}>
                <MessageSquare size={16} />
                <span>{t.chat.title}</span>
              </div>
              <div className={styles.mobileChatActions}>
                {isLandscape && (
                  <button
                    type="button"
                    className={styles.mobileChatActionBtn}
                    onClick={() => setMobileChatFullscreen((prev) => !prev)}
                    title={mobileChatFullscreen ? t.room.cinemaExit : t.room.cinemaEnter}
                    aria-label={mobileChatFullscreen ? t.room.cinemaExit : t.room.cinemaEnter}
                  >
                    {mobileChatFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                  </button>
                )}
                <button
                  type="button"
                  className={styles.mobileChatActionBtn}
                  onClick={() => setMobileChatOpen(false)}
                  title={t.room.chatClose}
                  aria-label={t.room.chatClose}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className={styles.mobileChatBody}>
              <RoomChat
                messages={messages}
                loading={chatLoading}
                onSend={handleSendChat}
                participants={participants}
                roomId={snapshot.room.id}
                isMuted={isCurrentUserMuted}
                onReportMessage={(messageId) => setReportTarget({ messageId })}
                onToggleReaction={handleToggleReaction}
                onDeleteMessage={handleDeleteMessage}
                isOwner={snapshot.isOwner}
                canControl={canControl}
                typingNames={typingNames}
                onTypingChange={handleTypingChange}
              />
            </div>
          </div>
        )}
      </main>

      <ConfirmDialog
        isOpen={pendingExit !== null}
        title={t.room.leaveTitle}
        message={t.room.leaveMessage}
        confirmLabel={t.room.leaveRoom}
        cancelLabel={t.room.leaveStay}
        onConfirm={() => void confirmExit()}
        onCancel={cancelExit}
      />

      <ReportModal
        isOpen={reportTarget !== null}
        onClose={() => setReportTarget(null)}
        onSubmit={handleReportSubmit}
        title={reportTarget?.messageId ? t.report.titleMessage : t.report.titleRoom}
      />
    </div>
  );
};
