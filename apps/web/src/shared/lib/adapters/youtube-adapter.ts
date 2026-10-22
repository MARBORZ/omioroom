import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

let ytScriptLoadingPromise: Promise<void> | null = null;

function loadYouTubeScript(): Promise<void> {
  if (ytScriptLoadingPromise) return ytScriptLoadingPromise;

  ytScriptLoadingPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      return resolve();
    }

    const existing = document.getElementById("youtube-iframe-api");
    if (existing) {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      return;
    }

    const script = document.createElement("script");
    script.id = "youtube-iframe-api";
    script.src = "https://www.youtube.com/iframe_api";
    window.onYouTubeIframeAPIReady = () => {
      resolve();
    };
    document.body.appendChild(script);
  });

  return ytScriptLoadingPromise;
}

export class YouTubePlayerAdapter implements PlayerAdapter {
  private player: any = null;
  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private timeUpdateInterval: any = null;
  private isBufferingState = false;
  private isReady = false;
  private readyQueue: Array<() => void> = [];

  async attach(container: HTMLElement): Promise<void> {
    this.containerElement = container;
    container.innerHTML = `<div id="yt-player-target" style="width:100%; height:100%;"></div>`;
    await loadYouTubeScript();
  }

  private emit(event: PlayerAdapterEvent) {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  private startTimeTracker() {
    this.stopTimeTracker();
    this.timeUpdateInterval = setInterval(() => {
      if (this.isReady && this.player && typeof this.player.getCurrentTime === "function") {
        try {
          this.emit({
            type: "timeupdate",
            currentTime: this.player.getCurrentTime() || 0,
            duration: this.player.getDuration() || 0,
          });
        } catch {
          // Ignore transient postMessage errors
        }
      }
    }, 250);
  }

  private stopTimeTracker() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    await loadYouTubeScript();

    return new Promise((resolve) => {
      if (this.player && this.isReady) {
        try {
          this.player.loadVideoById(media.sourceId, 0);
          resolve();
        } catch {
          this.recreatePlayer(media, resolve);
        }
      } else {
        this.recreatePlayer(media, resolve);
      }
    });
  }

  private recreatePlayer(media: MediaSourceInfo, onReadyCallback?: () => void) {
    this.isReady = false;
    if (this.containerElement) {
      this.containerElement.innerHTML = `<div id="yt-player-target" style="width:100%; height:100%;"></div>`;
    }

    const origin = typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "http://localhost:5174";

    this.player = new window.YT.Player("yt-player-target", {
      videoId: media.sourceId,
      width: "100%",
      height: "100%",
      playerVars: {
        enablejsapi: 1,
        origin: origin,
        autoplay: 0,
        controls: 1,
        disablekb: 1,
        fs: 0,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
      },
      events: {
        onReady: () => {
          this.isReady = true;
          // Flush pending actions
          while (this.readyQueue.length > 0) {
            const action = this.readyQueue.shift();
            try {
              action?.();
            } catch (err) {
              console.warn("Error running pending YouTube action:", err);
            }
          }
          onReadyCallback?.();
        },
        onStateChange: (event: any) => this.handleStateChange(event.data),
        onError: (err: any) => {
          this.emit({
            type: "error",
            currentTime: 0,
            duration: 0,
            error: `YouTube error code: ${err?.data}`,
          });
        },
      },
    });
  }

  private handleStateChange(state: number) {
    // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
    const currentTime = this.getCurrentTime();
    const duration = this.getDuration();

    if (state === 1) {
      // PLAYING
      this.isBufferingState = false;
      this.startTimeTracker();
      this.emit({ type: "play", currentTime, duration });
    } else if (state === 2) {
      // PAUSED
      this.isBufferingState = false;
      this.stopTimeTracker();
      this.emit({ type: "pause", currentTime, duration });
    } else if (state === 3) {
      // BUFFERING
      this.isBufferingState = true;
      this.emit({ type: "buffering", currentTime, duration });
    } else if (state === 0) {
      // ENDED
      this.isBufferingState = false;
      this.stopTimeTracker();
      this.emit({ type: "ended", currentTime, duration });
    }
  }

  private runWhenReady(action: () => void) {
    if (this.isReady && this.player) {
      try {
        action();
      } catch (err) {
        console.warn("YouTube action failed:", err);
      }
    } else {
      this.readyQueue.push(action);
    }
  }

  async play(): Promise<void> {
    this.runWhenReady(() => {
      if (this.player && typeof this.player.playVideo === "function") {
        try {
          this.player.playVideo();
        } catch {
          try {
            this.player.mute();
            this.player.playVideo();
          } catch {}
        }
      }
    });
  }

  async pause(): Promise<void> {
    this.runWhenReady(() => {
      if (this.player && typeof this.player.pauseVideo === "function") {
        this.player.pauseVideo();
      }
    });
  }

  async seek(seconds: number): Promise<void> {
    this.runWhenReady(() => {
      if (this.player && typeof this.player.seekTo === "function") {
        this.player.seekTo(seconds, true);
      }
    });
  }

  async setPlaybackRate(rate: number): Promise<void> {
    this.runWhenReady(() => {
      if (this.player && typeof this.player.setPlaybackRate === "function") {
        this.player.setPlaybackRate(rate);
      }
    });
  }

  setMuted(muted: boolean): void {
    this.runWhenReady(() => {
      if (!this.player) return;
      if (muted && typeof this.player.mute === "function") {
        this.player.mute();
      } else if (!muted && typeof this.player.unMute === "function") {
        this.player.unMute();
      }
    });
  }

  getCurrentTime(): number {
    if (this.isReady && this.player && typeof this.player.getCurrentTime === "function") {
      try {
        return this.player.getCurrentTime() || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  getDuration(): number {
    if (this.isReady && this.player && typeof this.player.getDuration === "function") {
      try {
        return this.player.getDuration() || 0;
      } catch {
        return 0;
      }
    }
    return 0;
  }

  isBuffering(): boolean {
    return this.isBufferingState;
  }

  destroy(): void {
    this.stopTimeTracker();
    this.isReady = false;
    this.readyQueue = [];
    if (this.player && typeof this.player.destroy === "function") {
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
