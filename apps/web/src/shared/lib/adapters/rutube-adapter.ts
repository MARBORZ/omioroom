import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

export class RutubePlayerAdapter implements PlayerAdapter {
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

  private postToPlayer(type: string, data: Record<string, any> = {}) {
    if (this.iframe && this.iframe.contentWindow) {
      this.iframe.contentWindow.postMessage(
        JSON.stringify({ type, data }),
        "*"
      );
    }
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.containerElement) return;

    this.destroy();

    const iframe = document.createElement("iframe");
    iframe.src = `https://rutube.ru/play/embed/${media.sourceId}?skinColor=ff6847`;
    iframe.style.width = "100%";
    iframe.style.height = "100%";
    iframe.style.border = "none";
    iframe.allow = "clipboard-write; autoplay; fullscreen";
    iframe.allowFullscreen = true;

    this.iframe = iframe;
    this.containerElement.innerHTML = "";
    this.containerElement.appendChild(iframe);

    this.messageHandler = (event: MessageEvent) => {
      try {
        const message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
        if (!message || typeof message !== "object") return;

        if (message.type === "player:changeState") {
          const state = message.data?.state;
          if (state === "playing") {
            this.isBufferingState = false;
            this.emit({ type: "play", currentTime: this.currentTime, duration: this.duration });
          } else if (state === "paused") {
            this.isBufferingState = false;
            this.emit({ type: "pause", currentTime: this.currentTime, duration: this.duration });
          } else if (state === "stopped") {
            this.emit({ type: "ended", currentTime: this.currentTime, duration: this.duration });
          }
        } else if (message.type === "player:currentTime") {
          this.currentTime = message.data?.time || 0;
          this.emit({ type: "timeupdate", currentTime: this.currentTime, duration: this.duration });
        } else if (message.type === "player:durationChange") {
          this.duration = message.data?.duration || 0;
        }
      } catch {
        // Ignore unparseable third-party messages
      }
    };

    window.addEventListener("message", this.messageHandler);
  }

  async play(): Promise<void> {
    this.postToPlayer("player:play");
  }

  async pause(): Promise<void> {
    this.postToPlayer("player:pause");
  }

  async seek(seconds: number): Promise<void> {
    this.currentTime = seconds;
    this.postToPlayer("player:setCurrentTime", { time: seconds });
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.postToPlayer("player:setPlaybackRate", { rate });
  }

  setMuted(muted: boolean): void {
    if (muted) {
      this.postToPlayer("player:mute");
    } else {
      this.postToPlayer("player:unMute");
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
