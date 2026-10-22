import React, { useEffect, useState, useCallback, useRef } from "react";
import { MessageSquare, Mic, Users, Share2, Film, X } from "lucide-react";
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
import { ResizeHandle } from "../../../shared/ui/resize-handle/resize-handle.js";
import { useResizableWidth } from "../../../shared/lib/use-resizable-width.js";
import { availableRates } from "../../../shared/lib/adapters/playback-rates.js";
import { backend, generateClientRequestId } from "../../../shared/api/backend.js";
import { openRoomChannel, type RoomChannelStatus } from "../../../shared/api/realtime.js";
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

  // Default to media picker if no video is loaded and user can control; otherwise chat
  const canControl = snapshot.canControl;
  const [activeTab, setActiveTab] = useState<RoomTab>(
    initialSnapshot.playback?.media ? "chat" : canControl ? "media" : "chat"
  );

  // Latest callbacks for the long-lived channel effect (they change identity on every parent render)
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;
  const tRef = useRef(t);
  tRef.current = t;
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
  const [seenMessages, setSeenMessages] = useState(0);

  // Draggable floating chat button in cinema mode
  const [fabPos, setFabPos] = useState<{ x: number; y: number } | null>(null);
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
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}
    if (!dragRef.current.hasMoved) {
      setCinemaChatOpen(true);
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
        handleSeek(Math.max(0, currentTime - 10));
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        handleSeek(Math.min(duration || Infinity, currentTime + 10));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isPlaying, currentTime, duration, canControl, cinema, handleToggleCinema]);

  // Applies a playback state only if it is newer than what we already show
  const applyPlayback = useCallback((state: RoomPlaybackStateDto) => {
    if (state.revision < playbackRevisionRef.current) return;
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
        if (fresh.playback) applyPlayback(fresh.playback);
      } catch (err: any) {
        if (!disposed && (err?.code === "ROOM_NOT_FOUND" || err?.code === "FORBIDDEN")) onLeaveRef.current();
      }
    };

    // Snapshot plus chat history: only when (re)subscribing, i.e. when events may have been missed
    const reloadAll = async () => {
      await reloadSnapshot();
      try {
        const history = await backend.chatHistory(roomId);
        if (disposed) return;
        setMessages(history);
        setChatLoading(false);
      } catch {
        // The next resync retries
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
      onChat: (msg) =>
        setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg].slice(-100))),
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
        void runHeartbeat();
      }
    };
    const onOnline = () => {
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

  // Command sender helper
  const sendPlayerCommand = useCallback(
    async (partialPayload: Omit<PlayerCommandPayload, "commandId" | "roomId">) => {
      isLocalCommandRef.current = true;
      try {
        const updatedState = await backend.playerCommand({
          ...partialPayload,
          commandId: generateClientRequestId(),
          roomId: snapshot.room.id,
        });
        applyPlayback(updatedState);
      } catch (err) {
        showToast(tRef.current.room.commandFailed, { id: "player-cmd-error" });
        setPendingRate(null);
        if (playback) {
          setCurrentTime(playback.anchorPosition);
        }
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
  const handleSeek = (pos: number) => {
    setCurrentTime(pos);
    if (seekTimerRef.current) clearTimeout(seekTimerRef.current);
    seekTimerRef.current = setTimeout(() => {
      seekTimerRef.current = null;
      videoPlayerRef.current?.seek(pos);
      sendPlayerCommand({ type: "seek", position: pos });
    }, 250);
  };

  // The speed picker answers at once; the room state confirms it (or takes it back if the command fails)
  const [pendingRate, setPendingRate] = useState<number | null>(null);
  const handleRateChange = (rate: number) => {
    setPendingRate(rate);
    void sendPlayerCommand({ type: "set-rate", playbackRate: rate }).finally(() => setPendingRate(null));
  };

  const handleMediaSelect = (media: MediaSourceInfo) => {
    sendPlayerCommand({
      type: "change-media",
      media,
    });
    // Immediately switch to chat once media is selected
    setActiveTab("chat");
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

  const handleSendChat = async (text: string, image: File | null) => {
    const path = image ? await backend.uploadChatImage(snapshot.room.id, image) : null;
    await backend.sendChat(snapshot.room.id, text, path);
  };


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
  const chatVisible = !cinema || cinemaChatOpen;
  useEffect(() => {
    if (chatVisible && (activeTab === "chat" || cinema)) setSeenMessages(messages.length);
  }, [chatVisible, activeTab, cinema, messages.length]);
  const unreadMessages = Math.max(0, messages.length - seenMessages);

  // Presence is live; fall back to the seat state from the database until it syncs
  const participants = snapshot.participants.map((p) => ({
    ...p,
    isOnline: presentIds ? presentIds.includes(p.userId) : p.isOnline,
  }));
  const activeParticipantsCount = participants.filter((p) => p.isOnline).length;

  useEffect(() => {
    if (!canControl && activeTab === "media") setActiveTab("chat");
  }, [canControl, activeTab]);

  const lastActor = playback?.updatedByUserId ?? null;
  const leaderPresent = lastActor !== null && (presentIds === null || presentIds.includes(lastActor));
  const leaderId = leaderPresent ? lastActor : snapshot.room.ownerUserId;
  const isLeader = user?.id === leaderId;
  const waitingNames = (playback?.bufferingBy ?? []).map(
    (id) => participants.find((p) => p.userId === id)?.displayName ?? "…"
  );

  return (
    <div className={styles.roomContainer} data-layout="room-page">
      {sessionStatus === "connected" && <ConnectionNotice status={channelStatus} />}
      <RoomHeader
        participantCount={activeParticipantsCount}
        maxParticipants={snapshot.room.maxParticipants}
        roomNumber={snapshot.room.globalId}
        onNavigateHome={() => setPendingExit("home")}
        onNavigateMyRooms={() => setPendingExit("my-rooms")}
        onLeave={() => setPendingExit("leave")}
        onOpenParticipants={() => setActiveTab("participants")}
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
            onUserAction={(action) =>
              sendPlayerCommand({ type: action.type, position: action.position })
            }
            onPositionUpdate={(curr, dur) => {
              setCurrentTime(curr);
              if (dur > 0) setDuration(dur);
            }}
            isMuted={isMuted}
            onBufferingChange={setIsBuffering}
            onToggleMute={() => setIsMuted((m) => !m)}
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
          />

          {(waitingNames.length > 0 || isBuffering) && (
            <div className={`${styles.waitNote} motion-fade`} role="status">
              {waitingNames.length > 0 ? `${t.group.waitingFor}: ${waitingNames.join(", ")}` : t.status.buffering}
            </div>
          )}

          {!playback?.media && (
            <div className={styles.videoPlaceholder}>
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
              <nav className={styles.tabBar} role="tablist" aria-label="Room sections">
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === "chat"}
                  className={`${styles.tabBtn} ${activeTab === "chat" ? styles.activeTab : ""}`}
                  onClick={() => setActiveTab("chat")}
                >
                  <MessageSquare size={14} />
                  <span>{t.room.tabChat}</span>
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
            </div>
          )}

          {/* Active Panel Content */}
          <div className={styles.panelsContainer}>
            {canControl && (
              <div data-panel="media" className={styles.panelWrapper}>
                <ChangeMediaInput onMediaSelect={handleMediaSelect} />
              </div>
            )}

            <div data-panel="voice" className={styles.panelWrapper}>
              <VoicePanel roomId={snapshot.room.id} userId={user?.id} participants={participants} />
            </div>

            <div data-panel="chat" className={styles.panelWrapper}>
              <RoomChat
                messages={messages}
                loading={chatLoading}
                onSend={handleSendChat}
                participants={participants}
                roomId={snapshot.room.id}
              />
            </div>

            <div data-panel="participants" className={styles.panelWrapper}>
              <ParticipantsPanel
                participants={participants}
                currentUserId={user?.id}
                isOwner={snapshot.isOwner}
                maxParticipants={snapshot.room.maxParticipants}
                controlMode={snapshot.room.controlMode}
                bannedUsers={snapshot.bannedUsers}
                onSaveSettings={handleSaveSettings}
                onToggleControl={handleToggleControl}
                onKickMember={async (uid) => {
                  await backend.kickMember(snapshot.room.id, uid);
                }}
                onBanMember={async (uid) => {
                  await backend.banMember(snapshot.room.id, uid);
                }}
                onUnbanMember={async (uid) => {
                  await backend.unbanMember(snapshot.room.id, uid);
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
            className={styles.chatFab}
            style={
              fabPos
                ? ({ left: `${fabPos.x}px`, top: `${fabPos.y}px`, right: "auto", bottom: "auto" } as React.CSSProperties)
                : undefined
            }
            onPointerDown={onFabPointerDown}
            onPointerMove={onFabPointerMove}
            onPointerUp={onFabPointerUp}
            onPointerCancel={onFabPointerUp}
            aria-label={t.room.chatOpen}
            title={t.room.chatOpen}
          >
            <MessageSquare size={22} />
            {unreadMessages > 0 && <span className={styles.chatFabBadge}>{unreadMessages > 99 ? "99+" : unreadMessages}</span>}
          </button>
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
    </div>
  );
};
