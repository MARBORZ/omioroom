import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";
import { PositionClock } from "./position-clock.js";

/**
 * Odnoklassniki embeds (ok.ru/videoembed/<id>) listen for `{ action, ... }` messages (play, pause, seek, mute, unmute)
 * and report back `{ event, time, duration }` messages (started, paused, resumed, rewound, timeupdate, ended, ads).
 * There is no speed control.
 */
export class OkPlayerAdapter implements PlayerAdapter {
  readonly fineRate = false;
  /** Position arrives about once a second, so judge drift more loosely. */
  readonly driftToleranceSeconds = 1.5;

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

  private send(message: Record<string, unknown>) {
    this.iframe?.contentWindow?.postMessage(message, "*");
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
    this.isBufferingState = false;

    const iframe = document.createElement("iframe");
    iframe.src = media.canonicalUrl;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "clipboard-write; autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    this.iframe = iframe;
    this.containerElement.appendChild(iframe);

    this.messageHandler = (event: MessageEvent) => {
      // Only listen to our own player, not to every frame on the page
      if (event.source !== iframe.contentWindow) return;
      let message: Record<string, unknown> | null = null;
      try {
        message = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch {
        return;
      }
      if (!message || typeof message !== "object" || typeof message.event !== "string") return;

      const time = Number(message.time);
      const hasTime = Number.isFinite(time);
      if (typeof message.duration === "number" && message.duration > 0) this.duration = message.duration;

      switch (message.event) {
        case "started":
        case "resumed":
          if (hasTime) this.clock.report(time);
          this.isBufferingState = false;
          this.clock.setPlaying(true);
          this.emit("play");
          break;
        case "paused":
          if (hasTime) this.clock.report(time);
          this.isBufferingState = false;
          this.clock.setPlaying(false);
          this.emit("pause");
          break;
        case "rewound":
        case "timeupdate":
          if (hasTime) {
            this.clock.report(time);
            this.isBufferingState = false;
            this.emit("timeupdate");
          }
          break;
        case "bufferingStarted":
        case "adShown":
          // An ad is not the video: hold the room briefly instead of letting it drift
          this.isBufferingState = true;
          this.emit("buffering");
          break;
        case "bufferingEnded":
        case "adEnd":
        case "adSkip":
          this.isBufferingState = false;
          this.emit("timeupdate");
          break;
        case "ended":
          this.clock.setPlaying(false);
          this.emit("ended");
          break;
        case "error":
          this.emit("error", "Odnoklassniki player error");
          break;
      }
    };
    window.addEventListener("message", this.messageHandler);
  }

  async play(): Promise<void> {
    this.send({ action: "play" });
  }

  async pause(): Promise<void> {
    this.send({ action: "pause" });
  }

  async seek(seconds: number): Promise<void> {
    this.clock.jump(seconds);
    this.send({ action: "seek", time: seconds });
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.clock.setRate(rate);
  }

  setMuted(muted: boolean): void {
    this.send({ action: muted ? "mute" : "unmute" });
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
