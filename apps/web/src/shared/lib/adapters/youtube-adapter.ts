import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";

declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}

function loadYouTubeScript(): Promise<void> {
  return new Promise((resolve) => {
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
}

export class YouTubePlayerAdapter implements PlayerAdapter {
  private player: any = null;
  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private timeUpdateInterval: any = null;
  private isBufferingState = false;

  async attach(container: HTMLElement): Promise<void> {
    await loadYouTubeScript();
    this.containerElement = container;
    container.innerHTML = `<div id="yt-player-target" style="width:100%; height:100%;"></div>`;
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
    }, 250);
  }

  private stopTimeTracker() {
    if (this.timeUpdateInterval) {
      clearInterval(this.timeUpdateInterval);
      this.timeUpdateInterval = null;
    }
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.player) {
      await loadYouTubeScript();
      return new Promise((resolve) => {
        this.player = new window.YT.Player("yt-player-target", {
          videoId: media.sourceId,
          playerVars: {
            autoplay: 0,
            controls: 0,
            disablekb: 1,
            fs: 0,
            modestbranding: 1,
            rel: 0,
            playsinline: 1,
          },
          events: {
            onReady: () => resolve(),
            onStateChange: (event: any) => this.handleStateChange(event.data),
            onError: (err: any) => {
              this.emit({
                type: "error",
                currentTime: 0,
                duration: 0,
                error: `YouTube Player error: ${err.data}`,
              });
            },
          },
        });
      });
    } else {
      if (typeof this.player.cueVideoById === "function") {
        this.player.cueVideoById(media.sourceId);
      }
    }
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

  async play(): Promise<void> {
    if (this.player && typeof this.player.playVideo === "function") {
      this.player.playVideo();
    }
  }

  async pause(): Promise<void> {
    if (this.player && typeof this.player.pauseVideo === "function") {
      this.player.pauseVideo();
    }
  }

  async seek(seconds: number): Promise<void> {
    if (this.player && typeof this.player.seekTo === "function") {
      this.player.seekTo(seconds, true);
    }
  }

  async setPlaybackRate(rate: number): Promise<void> {
    if (this.player && typeof this.player.setPlaybackRate === "function") {
      this.player.setPlaybackRate(rate);
    }
  }

  setMuted(muted: boolean): void {
    if (!this.player) return;
    if (muted && typeof this.player.mute === "function") {
      this.player.mute();
    } else if (!muted && typeof this.player.unMute === "function") {
      this.player.unMute();
    }
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
    if (this.player && typeof this.player.destroy === "function") {
      this.player.destroy();
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
