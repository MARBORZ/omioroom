import Hls from "hls.js";
import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

export class HlsPlayerAdapter implements PlayerAdapter {
  private videoElement: HTMLVideoElement | null = null;
  private hls: Hls | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private bufferingState = false;

  async attach(container: HTMLElement): Promise<void> {
    container.innerHTML = "";
    const video = document.createElement("video");
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.playsInline = true;
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
    video.addEventListener("play", () => {
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
      this.emit({ type: "timeupdate", currentTime: video.currentTime, duration: video.duration || 0 });
    });

    video.addEventListener("ended", () => {
      this.emit({
        type: "ended",
        currentTime: video.currentTime,
        duration: video.duration || 0,
      });
    });

    video.addEventListener("error", () => {
      this.emit({
        type: "error",
        currentTime: video.currentTime,
        duration: video.duration || 0,
        error: video.error?.message || "Failed to load HLS stream",
      });
    });
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.videoElement) return;

    if (Hls.isSupported()) {
      if (this.hls) {
        this.hls.destroy();
      }
      this.hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
      });
      this.hls.loadSource(media.canonicalUrl);
      this.hls.attachMedia(this.videoElement);
      this.hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          this.emit({
            type: "error",
            currentTime: 0,
            duration: 0,
            error: `HLS fatal error: ${data.details}`,
          });
        }
      });
    } else if (this.videoElement.canPlayType("application/vnd.apple.mpegurl")) {
      // Native Apple HLS (Safari)
      this.videoElement.src = media.canonicalUrl;
      this.videoElement.load();
    }
  }

  async play(): Promise<void> {
    if (!this.videoElement) return;
    try {
      await this.videoElement.play();
    } catch {
      this.videoElement.muted = true;
      await this.videoElement.play();
    }
  }

  async pause(): Promise<void> {
    this.videoElement?.pause();
  }

  async seek(seconds: number): Promise<void> {
    if (this.videoElement) {
      this.videoElement.currentTime = seconds;
    }
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (this.videoElement) {
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
    if (this.hls) {
      this.hls.destroy();
      this.hls = null;
    }
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
