import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

declare global {
  interface Window {
    Vimeo?: {
      Player: any;
    };
  }
}

let vimeoScriptPromise: Promise<void> | null = null;

function loadVimeoScript(): Promise<void> {
  if (vimeoScriptPromise) return vimeoScriptPromise;

  vimeoScriptPromise = new Promise((resolve) => {
    if (window.Vimeo && window.Vimeo.Player) {
      return resolve();
    }
    const script = document.createElement("script");
    script.src = "https://player.vimeo.com/api/player.js";
    script.onload = () => resolve();
    document.body.appendChild(script);
  });

  return vimeoScriptPromise;
}

export class VimeoPlayerAdapter implements PlayerAdapter {
  private player: any = null;
  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private currentTime = 0;
  private duration = 0;
  private isBufferingState = false;

  async attach(container: HTMLElement): Promise<void> {
    this.containerElement = container;
    container.innerHTML = `<div id="vimeo-player-target" style="width:100%; height:100%;"></div>`;
    await loadVimeoScript();
  }

  private emit(event: PlayerAdapterEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    await loadVimeoScript();

    if (this.player) {
      try {
        // Unlisted videos need their hash, which only the URL form carries
        await this.player.loadVideo(media.canonicalUrl.includes("h=") ? { url: media.canonicalUrl } : media.sourceId);
        return;
      } catch {
        try {
          this.player.destroy();
        } catch {}
        this.player = null;
      }
    }

    if (!this.containerElement) return;
    this.containerElement.innerHTML = `<div id="vimeo-player-target" style="width:100%; height:100%;"></div>`;

    const hashed = media.canonicalUrl.includes("h=");
    this.player = new window.Vimeo!.Player("vimeo-player-target", {
      ...(hashed ? { url: media.canonicalUrl } : { id: parseInt(media.sourceId, 10) }),
      width: "100%",
      controls: true,
      responsive: true,
      autoplay: false,
    });

    this.player.on("play", () => {
      this.isBufferingState = false;
      this.emit({ type: "play", currentTime: this.currentTime, duration: this.duration });
    });

    this.player.on("pause", () => {
      this.isBufferingState = false;
      this.emit({ type: "pause", currentTime: this.currentTime, duration: this.duration });
    });

    this.player.on("timeupdate", (data: { seconds: number; duration: number }) => {
      this.currentTime = data.seconds;
      this.duration = data.duration;
      this.emit({ type: "timeupdate", currentTime: this.currentTime, duration: this.duration });
    });

    this.player.on("bufferstart", () => {
      this.isBufferingState = true;
      this.emit({ type: "buffering", currentTime: this.currentTime, duration: this.duration });
    });

    this.player.on("bufferend", () => {
      this.isBufferingState = false;
    });

    this.player.on("ended", () => {
      this.emit({ type: "ended", currentTime: this.currentTime, duration: this.duration });
    });

    this.player.on("error", (err: any) => {
      this.emit({ type: "error", currentTime: this.currentTime, duration: this.duration, error: err?.message });
    });

    try {
      await this.player.ready();
    } catch (err: any) {
      // e.g. the video is private, removed, or does not allow embedding
      this.emit({ type: "error", currentTime: 0, duration: 0, error: err?.message ?? "Vimeo could not open this video" });
      return;
    }
    this.duration = await this.player.getDuration().catch(() => 0);
    this.emit({ type: "timeupdate", currentTime: 0, duration: this.duration });
  }

  async play(): Promise<void> {
    if (this.player) {
      try {
        await this.player.play();
      } catch (err: any) {
        // Only a blocked autoplay needs the user; an interrupted play() must not be retried
        if (err?.name === "NotAllowedError") {
          this.emit({ type: "autoplay-blocked", currentTime: this.currentTime, duration: this.duration });
        }
      }
    }
  }

  async pause(): Promise<void> {
    if (this.player) {
      await this.player.pause().catch(() => {});
    }
  }

  async seek(seconds: number): Promise<void> {
    if (this.player) {
      await this.player.setCurrentTime(seconds).catch(() => {});
      this.currentTime = seconds;
    }
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (this.player) {
      await this.player.setPlaybackRate(rate).catch(() => {});
    }
  }

  setMuted(muted: boolean): void {
    if (this.player) {
      this.player.setMuted(muted).catch(() => {});
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
    if (this.player) {
      try {
        this.player.destroy();
      } catch {}
      this.player = null;
    }
    this.listeners.clear();
    if (this.containerElement) {
      this.containerElement.innerHTML = "";
    }
  }

  onStateChange(callback: (event: PlayerAdapterEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
