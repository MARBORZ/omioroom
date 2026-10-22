import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

export class VkPlayerAdapter implements PlayerAdapter {
  private iframe: HTMLIFrameElement | null = null;
  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private currentTime = 0;
  private duration = 0;
  private isBufferingState = false;
  private messageHandler: ((e: MessageEvent) => void) | null = null;

  async attach(container: HTMLElement): Promise<void> {
    this.containerElement = container;
  }

  private emit(event: PlayerAdapterEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private postToVk(method: string, param?: any) {
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage(
        JSON.stringify({ method, param }),
        "*"
      );
    }
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.containerElement) return;

    this.destroy();

    const iframe = document.createElement("iframe");
    // Ensure js_api=1 is present for postMessage bridge
    const embedUrl = media.canonicalUrl.includes("?")
      ? `${media.canonicalUrl}&js_api=1`
      : `${media.canonicalUrl}?js_api=1`;

    iframe.src = embedUrl;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;

    this.iframe = iframe;
    this.containerElement.innerHTML = "";
    this.containerElement.appendChild(iframe);

    this.messageHandler = (event: MessageEvent) => {
      try {
        const data = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!data) return;

        const evt = data.event || data.type;
        if (evt === "onVideoPlay" || evt === "play") {
          this.isBufferingState = false;
          this.emit({ type: "play", currentTime: this.currentTime, duration: this.duration });
        } else if (evt === "onVideoPause" || evt === "pause") {
          this.isBufferingState = false;
          this.emit({ type: "pause", currentTime: this.currentTime, duration: this.duration });
        } else if (evt === "onVideoProgress" || evt === "timeupdate") {
          this.currentTime = data.data?.currentTime || data.time || 0;
          this.duration = data.data?.duration || data.duration || this.duration;
          this.emit({ type: "timeupdate", currentTime: this.currentTime, duration: this.duration });
        } else if (evt === "onVideoEnded" || evt === "ended") {
          this.emit({ type: "ended", currentTime: this.currentTime, duration: this.duration });
        }
      } catch {
        // Ignore other messages
      }
    };

    window.addEventListener("message", this.messageHandler);
  }

  async play(): Promise<void> {
    this.postToVk("play");
  }

  async pause(): Promise<void> {
    this.postToVk("pause");
  }

  async seek(seconds: number): Promise<void> {
    this.currentTime = seconds;
    this.postToVk("seek", seconds);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.postToVk("setPlaybackRate", rate);
  }

  setMuted(muted: boolean): void {
    if (muted) {
      this.postToVk("mute");
    } else {
      this.postToVk("unmute");
    }
  }

  getCurrentTime(): number {
    return this.currentTime;
  }

  getDuration(): number {
    return this.duration;
  }

  isBuffering(): boolean {
    return this.isBufferingState;
  }

  destroy(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.containerElement) {
      this.containerElement.innerHTML = "";
    }
    this.iframe = null;
    this.listeners.clear();
  }

  onStateChange(callback: (event: PlayerAdapterEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
