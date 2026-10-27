import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";
import { PositionClock } from "./position-clock.js";

/**
 * For platforms whose embed has no control API (Dzen, Dailymotion): the video is shown in an iframe
 * but cannot be started, paused or seeked from here, so each viewer presses play themselves. The clock simply follows
 * the room's state, which keeps the player from fighting the room over a position it cannot change.
 */
export class EmbedPlayerAdapter implements PlayerAdapter {
  readonly fineRate = false;
  /** There is nothing to correct, so never ask for a seek. */
  readonly driftToleranceSeconds = 1e6;

  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private clock = new PositionClock();

  async attach(container: HTMLElement): Promise<void> {
    this.containerElement = container;
  }

  private emit(type: PlayerAdapterEvent["type"]) {
    const event: PlayerAdapterEvent = { type, currentTime: this.clock.now(), duration: 0 };
    for (const listener of this.listeners) listener(event);
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.containerElement) return;
    this.containerElement.innerHTML = "";
    this.clock = new PositionClock();
    const iframe = document.createElement("iframe");
    iframe.src = media.canonicalUrl;
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "clipboard-write; autoplay; fullscreen; encrypted-media; picture-in-picture";
    iframe.allowFullscreen = true;
    iframe.referrerPolicy = "strict-origin-when-cross-origin";
    this.containerElement.appendChild(iframe);
    // Nothing reports readiness, so let the room go on once the frame has loaded
    iframe.addEventListener("load", () => this.emit("timeupdate"), { once: true });
  }

  async play(): Promise<void> {
    this.clock.setPlaying(true);
    this.emit("play");
  }

  async pause(): Promise<void> {
    this.clock.setPlaying(false);
    this.emit("pause");
  }

  async seek(seconds: number): Promise<void> {
    this.clock.jump(seconds);
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.clock.setRate(rate);
  }

  setMuted(): void {}

  getCurrentTime(): number {
    return this.clock.now();
  }

  getDuration(): number {
    return 0;
  }

  isBuffering(): boolean {
    return false;
  }

  destroy(): void {
    if (this.containerElement) this.containerElement.innerHTML = "";
    this.listeners.clear();
  }

  onStateChange(callback: (event: PlayerAdapterEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
