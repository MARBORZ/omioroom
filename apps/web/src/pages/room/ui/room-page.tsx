import React, { useEffect, useState, useCallback, useRef } from "react";
import { LogOut } from "lucide-react";
import { useSocketContext } from "../../../app/providers/socket-context.js";
import { useI18n } from "../../../shared/lib/i18n/index.js";
import { RoomHeader } from "../../../widgets/room-header/ui/room-header.js";
import { VideoPlayerFrame, type VideoPlayerHandle } from "../../../widgets/video-player/ui/video-player-frame.js";
import { PlaybackControls } from "../../../shared/ui/playback-controls/playback-controls.js";
import { ChangeMediaInput } from "../../../features/change-media/ui/change-media-input.js";
import { InvitePanel } from "../../../widgets/invite-panel/ui/invite-panel.js";
import { Button } from "../../../shared/ui/button/button.js";
import { emitCommand, generateClientRequestId } from "../../../shared/api/socket.js";
import {
  ClientCommand,
  ServerEvent,
  PlaybackStatus,
  type RoomSnapshotDto,
  type RoomPlaybackStateDto,
  type PlayerCommandPayload,
  type MediaSourceInfo,
  type RotatePrivateCodePayload,
  type SetVisibilityPayload,
  type RoomOwnerAccessDto,
} from "@omioroom/contracts";
import styles from "./room-page.module.scss";

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
  const { socket, connectionStatus, timeSync } = useSocketContext();
  const { t } = useI18n();

  const [snapshot, setSnapshot] = useState<RoomSnapshotDto>(initialSnapshot);
  const [playback, setPlayback] = useState<RoomPlaybackStateDto | null>(initialSnapshot.playback);
  const [ownerKey, setOwnerKey] = useState<string | null>(initialKey ?? null);

  // Local player tracking state
  const [currentTime, setCurrentTime] = useState(initialSnapshot.playback?.anchorPosition || 0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [lastSyncText, setLastSyncText] = useState(t.status.inSync);

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

  // Subscribe to real-time events
  useEffect(() => {
    const handlePlayerState = (newState: RoomPlaybackStateDto) => {
      setPlayback(newState);
      setLastSyncText(t.room.inSyncRev(newState.revision));
    };

    const handleParticipantJoined = (data: any) => {
      setSnapshot((prev) => ({
        ...prev,
        participants: [
          ...prev.participants.filter((p) => p.userId !== data.participant.userId),
          data.participant,
        ],
      }));
    };

    const handleParticipantLeft = (data: { userId: string }) => {
      setSnapshot((prev) => ({
        ...prev,
        participants: prev.participants.map((p) =>
          p.userId === data.userId ? { ...p, isOnline: false } : p
        ),
      }));
    };

    const handleAccessUpdated = (data: { visibility: "public" | "private" }) => {
      setSnapshot((prev) => ({
        ...prev,
        room: {
          ...prev.room,
          visibility: data.visibility,
        },
      }));
    };

    const handleRoomClosed = () => {
      alert(t.room.closedAlert);
      onLeave();
    };

    socket.on(ServerEvent.PLAYER_STATE, handlePlayerState);
    socket.on(ServerEvent.ROOM_PARTICIPANT_JOINED, handleParticipantJoined);
    socket.on(ServerEvent.ROOM_PARTICIPANT_LEFT, handleParticipantLeft);
    socket.on(ServerEvent.ROOM_ACCESS_UPDATED, handleAccessUpdated);
    socket.on(ServerEvent.ROOM_CLOSED, handleRoomClosed);

    return () => {
      socket.off(ServerEvent.PLAYER_STATE, handlePlayerState);
      socket.off(ServerEvent.ROOM_PARTICIPANT_JOINED, handleParticipantJoined);
      socket.off(ServerEvent.ROOM_PARTICIPANT_LEFT, handleParticipantLeft);
      socket.off(ServerEvent.ROOM_ACCESS_UPDATED, handleAccessUpdated);
      socket.off(ServerEvent.ROOM_CLOSED, handleRoomClosed);
    };
  }, [socket, onLeave]);

  // Command sender helper
  const sendPlayerCommand = useCallback(
    async (partialPayload: Omit<PlayerCommandPayload, "commandId" | "roomId">) => {
      isLocalCommandRef.current = true;
      try {
        const payload: PlayerCommandPayload = {
          ...partialPayload,
          commandId: generateClientRequestId(),
          roomId: snapshot.room.id,
          expectedRevision: playback?.revision,
        };

        const updatedState = await emitCommand<PlayerCommandPayload, RoomPlaybackStateDto>(
          socket,
          ClientCommand.PLAYER_COMMAND,
          payload
        );
        setPlayback(updatedState);
      } catch (err) {
        console.error("Player command error:", err);
      } finally {
        setTimeout(() => {
          isLocalCommandRef.current = false;
        }, 200);
      }
    },
    [socket, snapshot.room.id, playback?.revision]
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

  const handleSeek = (pos: number) => {
    setCurrentTime(pos);
    videoPlayerRef.current?.seek(pos);
    sendPlayerCommand({
      type: "seek",
      position: pos,
    });
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
  };

  const handleRotatePrivateCode = async () => {
    const payload: RotatePrivateCodePayload = { roomId: snapshot.room.id };
    const res = await emitCommand<RotatePrivateCodePayload, RoomOwnerAccessDto>(
      socket,
      ClientCommand.ROOM_ROTATE_PRIVATE_CODE,
      payload
    );
    setOwnerKey(res.privateCode);
  };

  const handleToggleVisibility = async (newVis: "public" | "private") => {
    const payload: SetVisibilityPayload = {
      roomId: snapshot.room.id,
      visibility: newVis,
    };
    const res = await emitCommand<SetVisibilityPayload, { room: any; ownerAccess: RoomOwnerAccessDto | null }>(
      socket,
      ClientCommand.ROOM_SET_VISIBILITY,
      payload
    );
    setSnapshot((prev) => ({
      ...prev,
      room: {
        ...prev.room,
        visibility: newVis,
      },
    }));
    if (res.ownerAccess) {
      setOwnerKey(res.ownerAccess.privateCode);
    } else {
      setOwnerKey(null);
    }
  };

  const handleLeave = async () => {
    try {
      await emitCommand<{ roomId: string }, { left: boolean }>(
        socket,
        ClientCommand.ROOM_LEAVE,
        { roomId: snapshot.room.id }
      );
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

  const activeParticipantsCount = snapshot.participants.filter((p) => p.isOnline).length;

  return (
    <div className={styles.roomContainer}>
      <RoomHeader
        globalRoomId={snapshot.room.globalId}
        participantCount={activeParticipantsCount}
        connectionStatus={connectionStatus}
        title={snapshot.room.title}
        onNavigateHome={onNavigateHome}
        onNavigateMyRooms={onNavigateMyRooms}
      />

      <main className={styles.mainContent}>
        {/* Cinematic Video Player Section */}
        <div className={styles.videoSection} ref={videoSectionRef}>
          <VideoPlayerFrame
            ref={videoPlayerRef}
            playbackState={playback}
            estimatedServerNow={timeSync.getEstimatedServerNow()}
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
            disabled={!playback?.media}
            onPlay={handlePlay}
            onPause={handlePause}
            onSeek={handleSeek}
            onRateChange={handleRateChange}
            onToggleMute={() => setIsMuted((m) => !m)}
            onToggleFullscreen={handleToggleFullscreen}
          />

          {/* Real-time sync status bar */}
          <div className={styles.syncStatusBar}>
            <span>● {isBuffering ? t.status.buffering : lastSyncText}</span>
            <span>{t.room.offset}: {Math.round(timeSync.getClockOffset())}ms</span>
            <Button variant="ghost" size="sm" onClick={handleLeave} icon={<LogOut size={14} />}>
              {t.room.leaveRoom}
            </Button>
          </div>
        </div>

        {/* Sidebar Controls Section */}
        <aside className={styles.sidebarSection}>
          <ChangeMediaInput onMediaSelect={handleMediaSelect} />

          <InvitePanel
            globalRoomId={snapshot.room.globalId}
            isOwner={snapshot.isOwner}
            visibility={snapshot.room.visibility}
            privateCode={ownerKey}
            onRotateCode={handleRotatePrivateCode}
            onToggleVisibility={handleToggleVisibility}
          />
        </aside>
      </main>
    </div>
  );
};
