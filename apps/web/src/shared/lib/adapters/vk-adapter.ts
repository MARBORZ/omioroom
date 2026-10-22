import type { MediaSourceInfo } from "@omioroom/contracts";
import type { PlayerAdapter, PlayerAdapterEvent } from "./player-adapter.js";
import { PositionClock } from "./position-clock.js";

/** What we use of VK's official player API (https://dev.vk.ru/en/widgets/video). */
interface VkPlayerState {
  state: string;
  time: number;
  duration: number;
}

interface VkVideoPlayer {
  play(): void;
  pause(): void;
  seek(time: number): void;
  mute(): void;
  unmute(): void;
  destroy(): void;
  on(event: string, listener: (state: VkPlayerState) => void): void;
}

declare global {
  interface Window {
    VK?: { VideoPlayer?: (iframe: HTMLIFrameElement) => VkVideoPlayer };
  }
}

const VK_SCRIPTS = ["https://vk.com/js/api/videoplayer.js", "https://vk.ru/js/api/videoplayer.js"];
let vkScriptPromise: Promise<void> | null = null;

function loadFrom(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${url}`));
    document.head.appendChild(script);
  });
}

function loadVkScript(): Promise<void> {
  if (vkScriptPromise) return vkScriptPromise;
  vkScriptPromise = (async () => {
    if (window.VK?.VideoPlayer) return;
    let lastError: unknown;
    for (const url of VK_SCRIPTS) {
      try {
        await loadFrom(url);
        if (window.VK?.VideoPlayer) return;
      } catch (err) {
        lastError = err;
      }
    }
    vkScriptPromise = null;
    throw lastError ?? new Error("VK player API unavailable");
  })();
  return vkScriptPromise;
}

export class VkPlayerAdapter implements PlayerAdapter {
  readonly fineRate = false;
  /** VK reports whole seconds and has no speed control in its API. */
  readonly driftToleranceSeconds = 1.5;

  private player: VkVideoPlayer | null = null;
  private containerElement: HTMLElement | null = null;
  private listeners = new Set<(event: PlayerAdapterEvent) => void>();
  private clock = new PositionClock();
  private duration = 0;
  private ready = false;
  private queue: Array<() => void> = [];

  async attach(container: HTMLElement): Promise<void> {
    this.containerElement = container;
  }

  private emit(type: PlayerAdapterEvent["type"], error?: string) {
    const event: PlayerAdapterEvent = { type, currentTime: this.clock.now(), duration: this.duration, error };
    for (const listener of this.listeners) listener(event);
  }

  private whenReady(action: () => void) {
    if (this.ready && this.player) action();
    else this.queue.push(action);
  }

  private teardown(): void {
    try {
      this.player?.destroy();
    } catch {
      // The iframe may already be gone
    }
    this.player = null;
    this.ready = false;
    this.queue = [];
    if (this.containerElement) this.containerElement.innerHTML = "";
  }

  async loadMedia(media: MediaSourceInfo): Promise<void> {
    if (!this.containerElement) return;
    this.teardown();
    this.clock = new PositionClock();
    this.duration = 0;

    try {
      await loadVkScript();
    } catch {
      this.emit("error", "VK player could not be loaded");
      return;
    }

    const iframe = document.createElement("iframe");
    const url = new URL(media.canonicalUrl);
    url.searchParams.set("js_api", "1");
    url.searchParams.set("autoplay", "0");
    iframe.src = url.toString();
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.allow = "autoplay; encrypted-media; fullscreen; picture-in-picture";
    iframe.allowFullscreen = true;
    this.containerElement.appendChild(iframe);

    let player: VkVideoPlayer;
    try {
      player = window.VK!.VideoPlayer!(iframe);
    } catch {
      this.emit("error", "VK did not accept this video link");
      return;
    }
    this.player = player;

    const sync = (s: VkPlayerState) => {
      if (typeof s.time === "number") this.clock.report(s.time);
      if (typeof s.duration === "number" && s.duration > 0) this.duration = s.duration;
    };

    player.on("inited", (s) => {
      sync(s);
      this.ready = true;
      const pending = this.queue.splice(0);
      pending.forEach((fn) => fn());
      this.emit("timeupdate");
    });
    player.on("timeupdate", (s) => {
      sync(s);
      this.emit("timeupdate");
    });
    const playing = (s: VkPlayerState) => {
      sync(s);
      this.clock.setPlaying(true);
      this.emit("play");
    };
    player.on("started", playing);
    player.on("resumed", playing);
    player.on("paused", (s) => {
      sync(s);
      this.clock.setPlaying(false);
      this.emit("pause");
    });
    player.on("ended", (s) => {
      sync(s);
      this.clock.setPlaying(false);
      this.emit("ended");
    });
    // VK refuses to start with sound without a user gesture: let the UI ask for a tap
    player.on("autoplaySoundProhibited", () => this.emit("autoplay-blocked"));
    player.on("error", () => this.emit("error", "VK could not play this video (it may not allow embedding)"));
  }

  async play(): Promise<void> {
    this.whenReady(() => this.player?.play());
  }

  async pause(): Promise<void> {
    this.whenReady(() => this.player?.pause());
  }

  async seek(seconds: number): Promise<void> {
    this.clock.jump(seconds);
    this.whenReady(() => this.player?.seek(seconds));
  }

  async setPlaybackRate(): Promise<void> {
    // VK's embed API has no playback speed control
  }

  setMuted(muted: boolean): void {
    this.whenReady(() => (muted ? this.player?.mute() : this.player?.unmute()));
  }

  getCurrentTime(): number {
    return this.clock.now();
  }

  getDuration(): number {
    return this.duration;
  }

  isBuffering(): boolean {
    return false;
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
