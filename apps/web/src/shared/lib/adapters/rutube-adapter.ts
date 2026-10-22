import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";
import { PositionClock } from "./position-clock.js";

/** RuTube embeds are driven by postMessage (player version 2.92+). Speeds are a fixed list. */
const RUTUBE_SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

export class RutubePlayerAdapter implements PlayerAdapter {
  readonly fineRate = false;
  /** Position arrives about once a second, so judge drift more loosely. */
  readonly driftToleranceSeconds = 1.2;

  private iframe: HTMLIFrameElement | null = null;
  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private clock = new PositionClock();
  private duration = 0;
  private isBufferingState = false;
  private messageHandler: ((e: MessageEvent) => void) | null = null;

  async attach(container: HTMLElement): Promise<void> {
    this.containerElement = container;
  }

  private emit(type: PlayerAdapterEvent["type"], error?: string) {
    const event: PlayerAdapterEvent = { type, currentTime: this.clock.now(), duration: this.duration, error };
    for (const listener of this.listeners) listener(event);
  }

  private send(type: string, data: Record<string, unknown> = {}) {
    this.iframe?.contentWindow?.postMessage(JSON.stringify({ type, data }), "*");
  }

  private teardown(): void {
    if (this.messageHandler) {
      window.removeEventListener("message", this.messageHandler);
      this.messageHandler = null;
    }
    if (this.containerElement) this.containerElement.innerHTML = "";
    this.iframe = null;
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.containerElement) return;
    this.teardown();
    this.clock = new PositionClock();
    this.duration = 0;

    const iframe = document.createElement("iframe");
    // canonicalUrl already carries the private key (?p=…) for private videos
    iframe.src = media.canonicalUrl;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "clipboard-write; autoplay; fullscreen; encrypted-media";
    iframe.allowFullscreen = true;
    this.iframe = iframe;
    this.containerElement.appendChild(iframe);

    this.messageHandler = (event: MessageEvent) => {
      // Only listen to our own player, not to every frame on the page
      if (event.source !== iframe.contentWindow) return;
      let message: { type?: string; data?: Record<string, unknown> } | null = null;
      try {
        message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!message || typeof message !== "object" || typeof message.type !== "string") return;
      const data = message.data ?? {};

      switch (message.type) {
        case "player:changeState": {
          const state = String(data.state);
          if (state === "playing") {
            this.isBufferingState = false;
            this.clock.setPlaying(true);
            this.emit("play");
          } else if (state === "pause" || state === "paused") {
            this.isBufferingState = false;
            this.clock.setPlaying(false);
            this.emit("pause");
          } else if (state === "buffering" || state === "advert") {
            // An ad is not the video: treat it like a stall so the room holds briefly instead of drifting
            this.isBufferingState = true;
            this.emit("buffering");
          } else if (state === "completed") {
            this.clock.setPlaying(false);
            this.emit("ended");
          }
          break;
        }
        case "player:currentTime": {
          const t = Number(data.currentTime ?? data.time);
          if (Number.isFinite(t)) {
            this.clock.report(t);
            if (typeof data.duration === "number") this.duration = data.duration;
            this.emit("timeupdate");
          }
          break;
        }
        case "player:durationChange":
          if (typeof data.duration === "number") {
            this.duration = data.duration;
            this.emit("timeupdate");
          }
          break;
        case "player:error":
          this.emit("error", String(data.message ?? "RuTube error"));
          break;
      }
    };
    window.addEventListener("message", this.messageHandler);
  }

  async play(): Promise<void> {
    this.send("player:play");
  }

  async pause(): Promise<void> {
    this.send("player:pause");
  }

  async seek(seconds: number): Promise<void> {
    this.clock.jump(seconds);
    this.send("player:setCurrentTime", { time: seconds });
  }

  async setPlaybackRate(rate: number): Promise<void> {
    const speed = RUTUBE_SPEEDS.reduce((best, s) => (Math.abs(s - rate) < Math.abs(best - rate) ? s : best), 1);
    this.clock.setRate(speed);
    this.send("player:setPlaybackSpeed", { speed });
  }

  setMuted(muted: boolean): void {
    this.send(muted ? "player:mute" : "player:unMute");
  }

  getCurrentTime(): number {
    return this.clock.now();
  }

  getDuration(): number {
    return this.duration;
  }

  isBuffering(): boolean {
    return this.isBufferingState;
  }

  destroy(): void {
    this.teardown();
    this.listeners.clear();
  }

  onStateChange(callback: (event: PlayerAdapterEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
