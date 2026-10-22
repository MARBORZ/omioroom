import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useEffect, useRef, useState, useCallback } from "react";
import { MediaType, PlaybackStatus, calculateExpectedPosition, } from "@omioroom/contracts";
import { Html5PlayerAdapter } from "../../../shared/lib/adapters/html5-adapter.js";
import { YouTubePlayerAdapter } from "../../../shared/lib/adapters/youtube-adapter.js";
import styles from "./video-player-frame.module.scss";
export const VideoPlayerFrame = ({ playbackState, estimatedServerNow, onPositionUpdate, onPlayStateChange, onBufferingChange, isMuted = false, }) => {
    const containerRef = useRef(null);
    const adapterRef = useRef(null);
    const currentMediaTypeRef = useRef(null);
    const isSyncingRef = useRef(false);
    const [overlayStatus, setOverlayStatus] = useState(null);
    // Initialize or swap adapter when media type changes
    const initAdapter = useCallback(async (media) => {
        if (!containerRef.current)
            return;
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
            const adapter = media.type === MediaType.YOUTUBE
                ? new YouTubePlayerAdapter()
                : new Html5PlayerAdapter();
            await adapter.attach(containerRef.current);
            adapterRef.current = adapter;
            currentMediaTypeRef.current = media.type;
            adapter.onStateChange((event) => {
                if (event.type === "timeupdate") {
                    onPositionUpdate(event.currentTime, event.duration);
                }
                else if (event.type === "play") {
                    onPlayStateChange?.(true);
                }
                else if (event.type === "pause" || event.type === "ended") {
                    onPlayStateChange?.(false);
                }
                else if (event.type === "buffering") {
                    onBufferingChange?.(true);
                }
                else if (event.type === "error") {
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
        if (!adapterRef.current || !playbackState || !playbackState.media)
            return;
        const adapter = adapterRef.current;
        const expected = calculateExpectedPosition(playbackState, estimatedServerNow);
        const actual = adapter.getCurrentTime();
        const driftSeconds = Math.abs(actual - expected);
        // Apply play/pause state
        if (playbackState.status === PlaybackStatus.PLAYING) {
            adapter.play().catch(() => { });
        }
        else if (playbackState.status === PlaybackStatus.PAUSED) {
            adapter.pause().catch(() => { });
        }
        // Apply rate
        adapter.setPlaybackRate(playbackState.playbackRate).catch(() => { });
        // Sync drift correction
        if (driftSeconds > 0.75) {
            // Seek threshold exceeded: seek directly
            isSyncingRef.current = true;
            adapter.seek(expected).finally(() => {
                setTimeout(() => {
                    isSyncingRef.current = false;
                }, 300);
            });
        }
        else if (driftSeconds > 0.25) {
            // Slight drift: compensate smoothly with tempo adjustment
            const nudge = actual < expected ? 1.05 : 0.95;
            adapter.setPlaybackRate(playbackState.playbackRate * nudge).catch(() => { });
        }
        else {
            adapter.setPlaybackRate(playbackState.playbackRate).catch(() => { });
        }
    }, [playbackState, estimatedServerNow]);
    // Clean up on unmount
    useEffect(() => {
        return () => {
            adapterRef.current?.destroy();
            adapterRef.current = null;
        };
    }, []);
    return (_jsxs("div", { className: styles.playerFrame, children: [_jsx("div", { ref: containerRef, className: styles.adapterContainer }), !playbackState?.media && (_jsxs("div", { className: styles.placeholder, children: [_jsx("div", { className: styles.retroTag, children: "STANDBY" }), _jsx("p", { className: styles.placeholderText, children: "No video loaded. Enter a YouTube URL or direct MP4/WebM video link below to watch together." })] })), overlayStatus && (_jsx("div", { className: styles.overlayMessage, children: overlayStatus }))] }));
};
