import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

export class Html5PlayerAdapter implements PlayerAdapter {
  private videoElement: HTMLVideoElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private bufferingState = false;

  async attach(container: HTMLElement): Promise<void> {
    container.innerHTML = "";
    const video = document.createElement("video");
    video.style.width = "100%";
    video.style.height = "100%";
    video.style.objectFit = "contain";
    video.playsInline = true;
    video.controls = false;

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
        error: video.error?.message || "Failed to load video",
      });
    });
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.videoElement) return;
    this.videoElement.src = media.canonicalUrl;
    this.videoElement.load();
  }

  async play(): Promise<void> {
    if (!this.videoElement) return;
    try {
      await this.videoElement.play();
    } catch {
      // Autoplay with audio was blocked by browser
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

  isBuffering(): boolean {
    return this.bufferingState;
  }

  destroy(): void {
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
