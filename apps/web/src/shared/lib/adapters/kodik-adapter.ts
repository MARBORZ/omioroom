import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";
import { PositionClock } from "./position-clock.js";

/**
 * Kodik player adapter for online cinema, anime, and series.
 * Embeds the Kodik iframe player and uses its postMessage API (kodik_player_api)
 * to achieve synchronized playback across all room participants.
 */
export class KodikPlayerAdapter implements PlayerAdapter {
  readonly fineRate = false;
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

  private send(method: string, args: Record<string, unknown> = {}) {
    this.iframe?.contentWindow?.postMessage(
      {
        key: "kodik_player_api",
        value: { method, ...args },
      },
      "*"
    );
  }

  private teardown(): void {
    if (this.messageHandler) {
      if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
        window.removeEventListener("message", this.messageHandler);
      }
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
    this.isBufferingState = false;

    const iframe = document.createElement("iframe");
    iframe.src = media.canonicalUrl;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "clipboard-write; autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    this.iframe = iframe;
    this.containerElement.appendChild(iframe);

    this.messageHandler = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      const msg = event.data;
      if (!msg || typeof msg !== "object") return;
      const key = msg.key;
      const val = msg.value;

      switch (key) {
        case "kodik_player_play":
        case "video_started":
          this.isBufferingState = false;
          this.clock.setPlaying(true);
          this.emit("play");
          break;
        case "kodik_player_pause":
          this.isBufferingState = false;
          this.clock.setPlaying(false);
          this.emit("pause");
          break;
        case "kodik_player_time":
        case "kodik_player_time_update": {
          const t = Number(val);
          if (Number.isFinite(t)) {
            this.clock.report(t);
            this.emit("timeupdate");
          }
          break;
        }
        case "kodik_player_duration_update": {
          const d = Number(val);
          if (Number.isFinite(d)) {
            this.duration = d;
            this.emit("timeupdate");
          }
          break;
        }
        case "kodik_player_seek": {
          const t = Number(val);
          if (Number.isFinite(t)) {
            this.clock.report(t);
            this.emit("timeupdate");
          }
          break;
        }
        case "kodik_player_video_ended":
          this.clock.setPlaying(false);
          this.emit("ended");
          break;
      }
    };

    if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
      window.addEventListener("message", this.messageHandler);
    }
  }

  async play(): Promise<void> {
    this.send("play");
  }

  async pause(): Promise<void> {
    this.send("pause");
  }

  async seek(seconds: number): Promise<void> {
    this.clock.report(seconds);
    this.send("seek", { seconds });
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.send("speed", { speed: rate });
  }

  setMuted(muted: boolean): void {
    this.send(muted ? "mute" : "unmute");
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
    return () => {
      this.listeners.delete(callback);
    };
  }
}
