import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useState, useCallback, useRef } from "react";
import { LogOut } from "lucide-react";
import { useSocketContext } from "../../../app/providers/socket-provider.js";
import { RoomHeader } from "../../../widgets/room-header/ui/room-header.js";
import { VideoPlayerFrame } from "../../../widgets/video-player/ui/video-player-frame.js";
import { PlaybackControls } from "../../../shared/ui/playback-controls/playback-controls.js";
import { ChangeMediaInput } from "../../../features/change-media/ui/change-media-input.js";
import { InvitePanel } from "../../../widgets/invite-panel/ui/invite-panel.js";
import { Button } from "../../../shared/ui/button/button.js";
import { emitCommand, generateClientRequestId } from "../../../shared/api/socket.js";
import { ClientCommand, ServerEvent, PlaybackStatus, } from "@omioroom/contracts";
import styles from "./room-page.module.scss";
export const RoomPage = ({ initialSnapshot, ownerAccessKey: initialKey, onLeave, onNavigateHome, onNavigateMyRooms, }) => {
    const { socket, connectionStatus, timeSync } = useSocketContext();
    const [snapshot, setSnapshot] = useState(initialSnapshot);
    const [playback, setPlayback] = useState(initialSnapshot.playback);
    const [ownerKey, setOwnerKey] = useState(initialKey ?? null);
    // Local player tracking state
    const [currentTime, setCurrentTime] = useState(initialSnapshot.playback?.anchorPosition || 0);
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const [isBuffering, setIsBuffering] = useState(false);
    const [lastSyncText, setLastSyncText] = useState("In sync");
    const isLocalCommandRef = useRef(false);
    // Subscribe to real-time events
    useEffect(() => {
        const handlePlayerState = (newState) => {
            setPlayback(newState);
            setLastSyncText(`In sync (rev ${newState.revision})`);
        };
        const handleParticipantJoined = (data) => {
            setSnapshot((prev) => ({
                ...prev,
                participants: [
                    ...prev.participants.filter((p) => p.userId !== data.participant.userId),
                    data.participant,
                ],
            }));
        };
        const handleParticipantLeft = (data) => {
            setSnapshot((prev) => ({
                ...prev,
                participants: prev.participants.map((p) => p.userId === data.userId ? { ...p, isOnline: false } : p),
            }));
        };
        const handleAccessUpdated = (data) => {
            setSnapshot((prev) => ({
                ...prev,
                room: {
                    ...prev.room,
                    visibility: data.visibility,
                },
            }));
        };
        const handleRoomClosed = () => {
            alert("This room has been closed by the owner.");
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
    const sendPlayerCommand = useCallback(async (partialPayload) => {
        isLocalCommandRef.current = true;
        try {
            const payload = {
                ...partialPayload,
                commandId: generateClientRequestId(),
                roomId: snapshot.room.id,
                expectedRevision: playback?.revision,
            };
            const updatedState = await emitCommand(socket, ClientCommand.PLAYER_COMMAND, payload);
            setPlayback(updatedState);
        }
        catch (err) {
            console.error("Player command error:", err);
        }
        finally {
            setTimeout(() => {
                isLocalCommandRef.current = false;
            }, 200);
        }
    }, [socket, snapshot.room.id, playback?.revision]);
    const handlePlay = () => {
        sendPlayerCommand({
            type: "play",
            position: currentTime,
        });
    };
    const handlePause = () => {
        sendPlayerCommand({
            type: "pause",
            position: currentTime,
        });
    };
    const handleSeek = (pos) => {
        setCurrentTime(pos);
        sendPlayerCommand({
            type: "seek",
            position: pos,
        });
    };
    const handleRateChange = (rate) => {
        sendPlayerCommand({
            type: "set-rate",
            playbackRate: rate,
        });
    };
    const handleMediaSelect = (media) => {
        sendPlayerCommand({
            type: "change-media",
            media,
        });
    };
    const handleRotatePrivateCode = async () => {
        const payload = { roomId: snapshot.room.id };
        const res = await emitCommand(socket, ClientCommand.ROOM_ROTATE_PRIVATE_CODE, payload);
        setOwnerKey(res.privateCode);
    };
    const handleToggleVisibility = async (newVis) => {
        const payload = {
            roomId: snapshot.room.id,
            visibility: newVis,
        };
        const res = await emitCommand(socket, ClientCommand.ROOM_SET_VISIBILITY, payload);
        setSnapshot((prev) => ({
            ...prev,
            room: {
                ...prev.room,
                visibility: newVis,
            },
        }));
        if (res.ownerAccess) {
            setOwnerKey(res.ownerAccess.privateCode);
        }
        else {
            setOwnerKey(null);
        }
    };
    const handleLeave = async () => {
        try {
            await emitCommand(socket, ClientCommand.ROOM_LEAVE, { roomId: snapshot.room.id });
        }
        finally {
            onLeave();
        }
    };
    const activeParticipantsCount = snapshot.participants.filter((p) => p.isOnline).length;
    const isPlaying = playback?.status === PlaybackStatus.PLAYING;
    return (_jsxs("div", { className: styles.roomContainer, children: [_jsx(RoomHeader, { globalRoomId: snapshot.room.globalId, participantCount: activeParticipantsCount, connectionStatus: connectionStatus, title: snapshot.room.title, onNavigateHome: onNavigateHome, onNavigateMyRooms: onNavigateMyRooms }), _jsxs("main", { className: styles.mainContent, children: [_jsxs("div", { className: styles.videoSection, children: [_jsx(VideoPlayerFrame, { playbackState: playback, estimatedServerNow: timeSync.getEstimatedServerNow(), onPositionUpdate: (curr, dur) => {
                                    setCurrentTime(curr);
                                    if (dur > 0)
                                        setDuration(dur);
                                }, isMuted: isMuted, onBufferingChange: setIsBuffering }), _jsx(PlaybackControls, { isPlaying: isPlaying, currentTime: currentTime, duration: duration, playbackRate: playback?.playbackRate || 1.0, isMuted: isMuted, disabled: !playback?.media, onPlay: handlePlay, onPause: handlePause, onSeek: handleSeek, onRateChange: handleRateChange, onToggleMute: () => setIsMuted((m) => !m) }), _jsxs("div", { className: styles.syncStatusBar, children: [_jsxs("span", { children: ["\u25CF ", isBuffering ? "Buffering..." : lastSyncText] }), _jsxs("span", { children: ["Offset: ", Math.round(timeSync.getClockOffset()), "ms"] }), _jsx(Button, { variant: "ghost", size: "sm", onClick: handleLeave, icon: _jsx(LogOut, { size: 14 }), children: "Leave Room" })] })] }), _jsxs("aside", { className: styles.sidebarSection, children: [_jsx(ChangeMediaInput, { onMediaSelect: handleMediaSelect }), _jsx(InvitePanel, { globalRoomId: snapshot.room.globalId, isOwner: snapshot.isOwner, visibility: snapshot.room.visibility, privateCode: ownerKey, onRotateCode: handleRotatePrivateCode, onToggleVisibility: handleToggleVisibility })] })] })] }));
};
