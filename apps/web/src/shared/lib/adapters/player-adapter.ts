import type { MediaSourceInfo } from "@omioroom/contracts";

export interface PlayerAdapterEvent {
  type: "play" | "pause" | "buffering" | "ended" | "timeupdate" | "error";
  currentTime: number;
  duration: number;
  error?: string;
}

export interface PlayerAdapter {
  attach(container: HTMLElement): Promise<void>;
  loadMedia(media: MediaSourceInfo): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  setPlaybackRate(rate: number): Promise<void>;
  setMuted(muted: boolean): void;
  getCurrentTime(): number;
  getDuration(): number;
  isBuffering(): boolean;
  /** Seconds of media already loaded ahead of the playhead, when the source can tell. */
  bufferedAhead?(): number;
  /** False when the source only accepts fixed playback rates (YouTube), so small drift cannot be nudged away. */
  readonly fineRate?: boolean;
  destroy(): void;
  onStateChange(callback: (event: PlayerAdapterEvent) => void): () => void;
}
