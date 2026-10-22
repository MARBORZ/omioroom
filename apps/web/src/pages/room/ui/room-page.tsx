import React, { useEffect, useState, useCallback, useRef } from "react";
import { MessageSquare, Mic, Users, Share2, Film, ChevronDown } from "lucide-react";
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
import { backend, generateClientRequestId } from "../../../shared/api/backend.js";
import { openRoomChannel, type RoomChannelStatus } from "../../../shared/api/realtime.js";
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

  const isPlaying = playback?.status === PlaybackStatus.PLAYING;
  const isLocalCommandRef = useRef(false);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  // Keyboard accessibility: Space for play/pause, Left/Right arrow for seek
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isInput =
        activeEl?.tagName === "INPUT" ||
        activeEl?.tagName === "TEXTAREA" ||
        (activeEl as HTMLElement)?.isContentEditable;

      if (isInput) return;

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
  }, [isPlaying, currentTime, duration]);

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
          alert(tRef.current.room.closedAlert);
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

    // Keeps our seat alive; the seat frees itself ~90s after the last sign of life
    const heartbeat = setInterval(() => void backend.touchRoom(roomId).catch(() => {}), 45_000);
    const onPageHide = () => void backend.leaveRoom(roomId).catch(() => {});
    window.addEventListener("pagehide", onPageHide);

    return () => {
      disposed = true;
      if (snapshotTimer) clearTimeout(snapshotTimer);
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", onPageHide);
      close();
    };
  }, [user, initialSnapshot.room.id, applyPlayback]);

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
        console.error("Player command error:", err);
      } finally {
        setTimeout(() => {
          isLocalCommandRef.current = false;
        }, 200);
      }
    },
    [snapshot.room.id, applyPlayback]
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

  const handleRateChange = (rate: number) => {
    sendPlayerCommand({
      type: "set-rate",
      playbackRate: rate,
    });
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

  const handleLeave = async () => {
    try {
      await backend.leaveRoom(snapshot.room.id);
    } catch {
      // The seat expires on its own
    } finally {
      onLeave();
    }
  };

  const handleToggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoSectionRef.current?.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

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
        title={snapshot.room.title}
        onNavigateHome={onNavigateHome}
        onNavigateMyRooms={onNavigateMyRooms}
        onLeave={handleLeave}
        onOpenParticipants={() => setActiveTab("participants")}
      />

      <main className={styles.mainContent} data-layout="room-main">
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
            playbackRate={playback?.playbackRate || 1.0}
            isMuted={isMuted}
            disabled={!playback?.media || !canControl}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRateChange={handleRateChange}
            onToggleMute={() => setIsMuted((m) => !m)}
            onToggleFullscreen={handleToggleFullscreen}
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
          {/* Room Navigation Tabs (Never overflows container) */}
          <div className={styles.tabNavContainer} data-layout="room-tabs">
            {/* Mobile / Narrow Dropdown Select */}
            <div className={styles.tabDropdownWrapper}>
              <select
                className={styles.tabSelect}
                value={activeTab}
                onChange={(e) => setActiveTab(e.target.value as RoomTab)}
                aria-label={t.common.room}
              >
                <option value="chat">💬 {t.room.tabChat}</option>
                <option value="voice">🎙️ {t.room.tabVoice}</option>
                <option value="participants">
                  👥 {t.room.tabParticipants} ({activeParticipantsCount})
                </option>
                <option value="invite">🔗 {t.room.tabInvite}</option>
                {canControl && <option value="media">🎬 {t.room.tabMedia}</option>}
              </select>
              <ChevronDown size={14} className={styles.tabSelectChevron} aria-hidden />
            </div>

            {/* Horizontal Overflow-scroll list */}
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
              <RoomChat messages={messages} loading={chatLoading} onSend={handleSendChat} />
            </div>

            <div data-panel="participants" className={styles.panelWrapper}>
              <ParticipantsPanel
                participants={participants}
                currentUserId={user?.id}
                isOwner={snapshot.isOwner}
                maxParticipants={snapshot.room.maxParticipants}
                controlMode={snapshot.room.controlMode}
                onSaveSettings={handleSaveSettings}
                onToggleControl={handleToggleControl}
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
      </main>
    </div>
  );
};
