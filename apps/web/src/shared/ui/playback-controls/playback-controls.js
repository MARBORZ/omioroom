import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize } from "lucide-react";
import { formatTime } from "../../lib/format-time.js";
import styles from "./playback-controls.module.scss";
export const PlaybackControls = ({ isPlaying, currentTime, duration, playbackRate = 1.0, isMuted = false, disabled = false, onPlay, onPause, onSeek, onRateChange, onToggleMute, onToggleFullscreen, }) => {
    const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
    const handleSliderChange = (e) => {
        const val = parseFloat(e.target.value);
        onSeek(val);
    };
    const skipForward = () => {
        onSeek(Math.min(duration, currentTime + 10));
    };
    const skipBackward = () => {
        onSeek(Math.max(0, currentTime - 10));
    };
    return (_jsxs("div", { className: styles.controlsContainer, role: "region", "aria-label": "Playback controls", children: [_jsxs("div", { className: styles.timelineRow, children: [_jsx("span", { className: styles.timeDisplay, children: formatTime(currentTime) }), _jsxs("div", { className: styles.sliderWrapper, children: [_jsx("div", { className: styles.sliderTrack, children: _jsx("div", { className: styles.sliderProgress, style: { width: `${progressPercent}%` } }) }), _jsx("input", { type: "range", min: 0, max: duration || 100, step: 0.1, value: currentTime, onChange: handleSliderChange, disabled: disabled || duration <= 0, className: styles.rangeInput, "aria-label": "Seek slider" })] }), _jsx("span", { className: styles.timeDisplay, children: formatTime(duration) })] }), _jsxs("div", { className: styles.buttonsRow, children: [_jsxs("div", { className: styles.leftGroup, children: [_jsx("button", { type: "button", className: styles.playPauseBtn, onClick: isPlaying ? onPause : onPlay, disabled: disabled, "aria-label": isPlaying ? "Pause video" : "Play video", children: isPlaying ? _jsx(Pause, { size: 20 }) : _jsx(Play, { size: 20, style: { marginLeft: 2 } }) }), _jsx("button", { type: "button", className: styles.iconBtn, onClick: skipBackward, disabled: disabled, "aria-label": "Skip backward 10 seconds", title: "-10 sec", children: _jsx(RotateCcw, { size: 18 }) }), _jsx("button", { type: "button", className: styles.iconBtn, onClick: skipForward, disabled: disabled, "aria-label": "Skip forward 10 seconds", title: "+10 sec", children: _jsx(RotateCw, { size: 18 }) }), onToggleMute && (_jsx("button", { type: "button", className: styles.iconBtn, onClick: onToggleMute, "aria-label": isMuted ? "Unmute" : "Mute", children: isMuted ? _jsx(VolumeX, { size: 18 }) : _jsx(Volume2, { size: 18 }) }))] }), _jsxs("div", { className: styles.rightGroup, children: [onRateChange && (_jsxs("select", { value: playbackRate, onChange: (e) => onRateChange(parseFloat(e.target.value)), disabled: disabled, className: styles.rateSelect, "aria-label": "Playback speed", children: [_jsx("option", { value: "0.5", children: "0.5x" }), _jsx("option", { value: "0.75", children: "0.75x" }), _jsx("option", { value: "1", children: "1.0x" }), _jsx("option", { value: "1.25", children: "1.25x" }), _jsx("option", { value: "1.5", children: "1.5x" }), _jsx("option", { value: "2", children: "2.0x" })] })), onToggleFullscreen && (_jsx("button", { type: "button", className: styles.iconBtn, onClick: onToggleFullscreen, "aria-label": "Toggle fullscreen", children: _jsx(Maximize, { size: 18 }) }))] })] })] }));
};
