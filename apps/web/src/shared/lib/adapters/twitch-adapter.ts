import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

declare global {
  interface Window {
    Twitch?: {
      Player: any;
    };
  }
}

let twitchScriptPromise: Promise<void> | null = null;

function loadTwitchScript(): Promise<void> {
  if (twitchScriptPromise) return twitchScriptPromise;

  twitchScriptPromise = new Promise((resolve) => {
    if (window.Twitch && window.Twitch.Player) {
      return resolve();
    }
    const script = document.createElement("script");
    script.src = "https://player.twitch.tv/js/embed/v1.js";
    script.onload = () => resolve();
    document.body.appendChild(script);
  });

  return twitchScriptPromise;
}

export class TwitchPlayerAdapter implements PlayerAdapter {
  readonly fineRate = false;
  private ready = false;
  private queue: Array<() => void> = [];
  private player: any = null;
  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private timeUpdateInterval: any = null;
  private isBufferingState = false;

  async attach(container: HTMLElement): Promise<void> {
    this.containerElement = container;
    container.innerHTML = `<div id="twitch-player-target" style="width:100%; height:100%;"></div>`;
    await loadTwitchScript();
  }

  private emit(event: PlayerAdapterEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private startTimeTracker() {
    this.stopTimeTracker();
    this.timeUpdateInterval = setInterval(() => {
      if (this.player && typeof this.player.getCurrentTime === "function") {
        this.emit({
          type: "timeupdate",
          currentTime: this.player.getCurrentTime() || 0,
          duration: this.player.getDuration() || 0,
        });
      }
    }, 500);
  }

  private stopTimeTracker() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    await loadTwitchScript();

    if (this.containerElement) {
      this.containerElement.innerHTML = `<div id="twitch-player-target" style="width:100%; height:100%;"></div>`;
    }

    const isVideo = media.sourceId.startsWith("v");
    const options: any = {
      width: "100%",
      height: "100%",
      autoplay: false,
      parent: [window.location.hostname || "localhost"],
    };

    if (isVideo) {
      options.video = media.sourceId.slice(1);
    } else {
      options.channel = media.sourceId;
    }

    this.ready = false;
    this.queue = [];
    this.player = new window.Twitch!.Player("twitch-player-target", options);

    // Commands sent before the player is ready are dropped by Twitch: hold them until READY
    this.player.addEventListener(window.Twitch!.Player.READY, () => {
      this.ready = true;
      const pending = this.queue.splice(0);
      pending.forEach((fn) => fn());
    });

    this.player.addEventListener(window.Twitch!.Player.PLAY, () => {
      this.isBufferingState = false;
      this.startTimeTracker();
      this.emit({
        type: "play",
        currentTime: this.getCurrentTime(),
        duration: this.getDuration(),
      });
    });

    this.player.addEventListener(window.Twitch!.Player.PAUSE, () => {
      this.isBufferingState = false;
      this.stopTimeTracker();
      this.emit({
        type: "pause",
        currentTime: this.getCurrentTime(),
        duration: this.getDuration(),
      });
    });

    this.player.addEventListener(window.Twitch!.Player.ENDED, () => {
      this.stopTimeTracker();
      this.emit({
        type: "ended",
        currentTime: this.getCurrentTime(),
        duration: this.getDuration(),
      });
    });
  }

  private whenReady(action: () => void) {
    if (this.ready && this.player) action();
    else this.queue.push(action);
  }

  async play(): Promise<void> {
    this.whenReady(() => {
      try {
        this.player.play();
      } catch {
        this.player.setMuted(true);
        this.player.play();
      }
    });
  }

  async pause(): Promise<void> {
    this.whenReady(() => this.player.pause());
  }

  async seek(seconds: number): Promise<void> {
    this.whenReady(() => this.player.seek(seconds));
  }

  async setPlaybackRate(): Promise<void> {
    // Twitch live/VOD doesn't expose playback rate control in embed
  }

  setMuted(muted: boolean): void {
    this.whenReady(() => this.player.setMuted(muted));
  }

  getCurrentTime(): number {
    if (this.player && typeof this.player.getCurrentTime === "function") {
      return this.player.getCurrentTime() || 0;
    }
    return 0;
  }

  getDuration(): number {
    if (this.player && typeof this.player.getDuration === "function") {
      return this.player.getDuration() || 0;
    }
    return 0;
  }

  isBuffering(): boolean {
    return this.isBufferingState;
  }

  destroy(): void {
    this.stopTimeTracker();
    if (this.containerElement) {
      this.containerElement.innerHTML = "";
    }
    this.player = null;
    this.ready = false;
    this.queue = [];
    this.listeners.clear();
  }

  onStateChange(callback: (event: PlayerAdapterEvent) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }
}
