import React from "react";
import { Play, Pause, RotateCcw, RotateCw, Volume2, VolumeX, Maximize, Minimize } from "lucide-react";
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
  onSeek: (position: number, immediate?: boolean) => void;
  onRateChange?: (rate: number) => void;
  onToggleMute?: () => void;
  /** Speeds the current source supports; empty means it cannot change speed. */
  rates?: number[];
  onToggleCinema?: () => void;
  cinema?: boolean;
  pausedByName?: string | null;
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
  rates = [0.5, 0.75, 1, 1.25, 1.5, 2],
  onToggleCinema,
  cinema = false,
  pausedByName = null,
}) => {
  const { t } = useI18n();
  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    onSeek(val);
  };

  const skipForward = () => {
    onSeek(Math.min(duration, currentTime + 10), true);
  };

  const skipBackward = () => {
    onSeek(Math.max(0, currentTime - 10), true);
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
            aria-label={
              isPlaying
                ? t.room.pauseVideo
                : pausedByName
                ? `${t.room.actionPaused}: ${pausedByName}`
                : t.room.playVideo
            }
            title={
              isPlaying
                ? t.room.pauseVideo
                : pausedByName
                ? `${t.room.actionPaused}: ${pausedByName}`
                : t.room.playVideo
            }
          >
            {isPlaying ? <Pause size={20} /> : <Play size={20} className={styles.playIcon} />}
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
              disabled={disabled || rates.length === 0}
              className={styles.rateSelect}
              aria-label="Playback speed"
              title={rates.length === 0 ? t.room.speedUnsupported : undefined}
            >
              {(rates.length === 0 ? [1] : rates).map((r) => (
                <option key={r} value={r}>{r}x</option>
              ))}
            </select>
          )}

          {onToggleCinema && (
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onToggleCinema}
              aria-label={cinema ? t.room.cinemaExit : t.room.cinemaEnter}
              title={cinema ? t.room.cinemaExit : t.room.cinemaEnter}
              aria-pressed={cinema}
            >
              {cinema ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
