import React from "react";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize } from "lucide-react";
import { useI18n } from "../../lib/i18n/index.js";
import { formatTime } from "../../lib/format-time.js";
import styles from "./playback-controls.module.scss";

interface PlaybackControlsProps {
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate?: number;
  isMuted?: boolean;
  disabled?: boolean;
  onPlay: () => void;
  onPause: () => void;
  onSeek: (position: number) => void;
  onRateChange?: (rate: number) => void;
  onToggleMute?: () => void;
  onToggleFullscreen?: () => void;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  currentTime,
  duration,
  playbackRate = 1.0,
  isMuted = false,
  disabled = false,
  onPlay,
  onPause,
  onSeek,
  onRateChange,
  onToggleMute,
  onToggleFullscreen,
}) => {
  const { t } = useI18n();
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onSeek(val);
  };

  const skipForward = () => {
    onSeek(Math.min(duration, currentTime + 10));
  };

  const skipBackward = () => {
    onSeek(Math.max(0, currentTime - 10));
  };

  return (
    <div className={styles.controlsContainer} role="region" aria-label="Playback controls">
      {/* Progress Timeline */}
      <div className={styles.timelineRow}>
        <span className={styles.timeDisplay}>{formatTime(currentTime)}</span>
        <div className={styles.sliderWrapper}>
          <div className={styles.sliderTrack}>
            <div className={styles.sliderProgress} style={{ width: `${progressPercent}%` }} />
          </div>
          <input
            type="range"
            min={0}
            max={duration || 100}
            step={0.1}
            value={currentTime}
            onChange={handleSliderChange}
            disabled={disabled || duration <= 0}
            className={styles.rangeInput}
            aria-label="Seek slider"
          />
        </div>
        <span className={styles.timeDisplay}>{formatTime(duration)}</span>
      </div>

      {/* Buttons bar */}
      <div className={styles.buttonsRow}>
        <div className={styles.leftGroup}>
          <button
            type="button"
            className={styles.playPauseBtn}
            onClick={isPlaying ? onPause : onPlay}
            disabled={disabled}
            aria-label={isPlaying ? t.room.pauseVideo : t.room.playVideo}
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} style={{ marginLeft: 2 }} />}
          </button>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={skipBackward}
            disabled={disabled}
            aria-label={t.room.skipBackward}
            title={t.room.skipBackward}
          >
            <RotateCcw size={18} />
          </button>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={skipForward}
            disabled={disabled}
            aria-label={t.room.skipForward}
            title={t.room.skipForward}
          >
            <RotateCw size={18} />
          </button>

          {onToggleMute && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onToggleMute}
              aria-label={isMuted ? t.room.unmute : t.room.mute}
              title={isMuted ? t.room.unmute : t.room.mute}
            >
              {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} />}
            </button>
          )}
        </div>

        <div className={styles.rightGroup}>
          {onRateChange && (
            <select
              value={playbackRate}
              onChange={(e) => onRateChange(parseFloat(e.target.value))}
              disabled={disabled}
              className={styles.rateSelect}
              aria-label="Playback speed"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1.0x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2.0x</option>
            </select>
          )}

          {onToggleFullscreen && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onToggleFullscreen}
              aria-label="Toggle fullscreen"
            >
              <Maximize size={18} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
