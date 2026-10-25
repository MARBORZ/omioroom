import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

const MAX_RETRIES = 8;

export class Html5PlayerAdapter implements PlayerAdapter {
  private videoElement: HTMLVideoElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private bufferingState = false;
  private wantPlaying = false;
  private currentRate = 1;
  private mediaUrl: string | null = null;
  private retries = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private resumeAt = 0;

  async attach(container: HTMLElement): Promise<void> {
    container.innerHTML = "";
    const video = document.createElement("video");
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.playsInline = true;
    // Long files (hours) are fetched progressively; ask the browser to keep buffering ahead
    video.preload = "auto";
    video.controls = true;

    this.videoElement = video;
    container.appendChild(video);

    this.bindEvents(video);
  }

  private emit(event: PlayerAdapterEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private bindEvents(video: HTMLVideoElement) {
    const onLoaded = () => {
      if (this.currentRate !== 1 && video.playbackRate !== this.currentRate) {
        video.playbackRate = this.currentRate;
      }
      this.emit({
        type: "timeupdate",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    };

    video.addEventListener("loadedmetadata", onLoaded);
    video.addEventListener("canplay", onLoaded);

    video.addEventListener("play", () => {
      if (this.currentRate !== 1 && video.playbackRate !== this.currentRate) {
        video.playbackRate = this.currentRate;
      }
      this.bufferingState = false;
      this.emit({
        type: "play",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("pause", () => {
      this.emit({
        type: "pause",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("waiting", () => {
      this.bufferingState = true;
      this.emit({
        type: "buffering",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("playing", () => {
      this.bufferingState = false;
      this.emit({
        type: "play",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("timeupdate", () => {
      this.emit({
        type: "timeupdate",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("loadedmetadata", () => {
      this.emit({
        type: "timeupdate",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("ended", () => {
      this.emit({
        type: "ended",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("error", () => {
      // A dropped connection to the file server: give it a few chances to come back before reporting a failure.
      // (code 2 = network, 4 = source not reachable/supported; 1 = aborted by us, 3 = decode: not retried)
      const code = video.error?.code;
      if ((code === 2 || code === 4) && this.mediaUrl && this.retries < MAX_RETRIES) {
        this.scheduleRetry(video);
        return;
      }
      this.emit({
        type: "error",
        currentTime: video.currentTime,
        duration: video.duration || 0,
        error: video.error?.message || "Failed to load video",
      });
    });

    video.addEventListener("canplay", () => {
      this.retries = 0;
    });
  }

  private scheduleRetry(video: HTMLVideoElement) {
    if (this.retryTimer) return;
    this.resumeAt = video.currentTime || this.resumeAt;
    this.retries += 1;
    this.bufferingState = true;
    this.emit({ type: "buffering", currentTime: this.resumeAt, duration: video.duration || 0 });
    const delay = Math.min(1500 * 2 ** (this.retries - 1), 15000);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.videoElement || !this.mediaUrl) return;
      const at = this.resumeAt;
      const v = this.videoElement;
      v.src = this.mediaUrl;
      v.addEventListener(
        "loadedmetadata",
        () => {
          if (at > 0) v.currentTime = at;
          if (this.wantPlaying) void v.play().catch(() => {});
        },
        { once: true }
      );
      v.load();
    }, delay);
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.videoElement) return;
    this.mediaUrl = media.canonicalUrl;
    this.retries = 0;
    this.resumeAt = 0;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    this.videoElement.src = media.canonicalUrl;
    this.videoElement.load();
  }

  async play(): Promise<void> {
    const video = this.videoElement;
    if (!video) return;
    this.wantPlaying = true;
    try {
      await video.play();
    } catch (err) {
      // A pause() or a new load interrupting this play() is not a failure to report, and above all
      // must not be "retried": that restarted paused videos by themselves.
      if ((err as DOMException)?.name === "NotAllowedError" && this.wantPlaying) {
        this.emit({
          type: "autoplay-blocked",
          currentTime: video.currentTime,
          duration: video.duration || 0,
        });
      }
    }
  }

  async pause(): Promise<void> {
    this.wantPlaying = false;
    this.videoElement?.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (this.videoElement) {
      this.videoElement.currentTime = seconds;
    }
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.currentRate = rate;
    if (this.videoElement) {
      this.videoElement.defaultPlaybackRate = rate;
      this.videoElement.playbackRate = rate;
    }
  }

  setMuted(muted: boolean): void {
    if (this.videoElement) {
      this.videoElement.muted = muted;
    }
  }

  getCurrentTime(): number {
    return this.videoElement?.currentTime || 0;
  }

  getDuration(): number {
    return this.videoElement?.duration || 0;
  }

  bufferedAhead(): number {
    const v = this.videoElement;
    if (!v) return 0;
    for (let i = 0; i < v.buffered.length; i++) {
      if (v.currentTime >= v.buffered.start(i) && v.currentTime <= v.buffered.end(i)) {
        return v.buffered.end(i) - v.currentTime;
      }
    }
    return 0;
  }

  isBuffering(): boolean {
    return this.bufferingState;
  }

  destroy(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.mediaUrl = null;
    if (this.videoElement) {
      this.videoElement.pause();
      this.videoElement.src = "";
      this.videoElement.remove();
      this.videoElement = null;
    }
    this.listeners.clear();
  }

  onStateChange(callback: (event: PlayerAdapterEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
