import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MediaType } from "@omioroom/contracts";
import { Html5PlayerAdapter } from "../shared/lib/adapters/html5-adapter.js";
import type { PlayerAdapterEvent } from "../shared/lib/adapters/player-adapter.js";

function fakeVideo() {
  const handlers = new Map<string, Array<() => void>>();
  const video: any = {
    style: {},
    src: "",
    error: null as null | { code: number; message: string },
    currentTime: 0,
    duration: 0,
    buffered: { length: 0 },
    addEventListener: (type: string, fn: () => void) => handlers.set(type, [...(handlers.get(type) ?? []), fn]),
    load: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    remove: vi.fn(),
    fire: (type: string) => (handlers.get(type) ?? []).forEach((fn) => fn()),
  };
  return video;
}

describe("Html5PlayerAdapter connection drops", () => {
  const origDocument = (globalThis as any).document;
  let video: ReturnType<typeof fakeVideo>;
  let events: PlayerAdapterEvent[];
  let adapter: Html5PlayerAdapter;

  beforeEach(async () => {
    vi.useFakeTimers();
    video = fakeVideo();
    (globalThis as any).document = { createElement: () => video };
    adapter = new Html5PlayerAdapter();
    events = [];
    await adapter.attach({ innerHTML: "", appendChild: vi.fn() } as unknown as HTMLElement);
    adapter.onStateChange((e) => events.push(e));
    await adapter.loadMedia({ type: MediaType.HTML5, sourceId: "x", canonicalUrl: "https://a.example/f.mp4" });
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as any).document = origDocument;
  });

  it("reloads the file after a network error instead of failing, and keeps the place", async () => {
    video.currentTime = 120;
    video.error = { code: 2, message: "network" };
    video.fire("error");

    expect(events.some((e) => e.type === "error")).toBe(false);
    expect(events.some((e) => e.type === "buffering")).toBe(true);

    expect(video.load).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1500);
    expect(video.load).toHaveBeenCalledTimes(2);
    expect(video.src).toBe("https://a.example/f.mp4");

    video.fire("loadedmetadata");
    expect(video.currentTime).toBe(120);
  });

  it("gives up and reports the error after repeated failures, and never retries a decode error", async () => {
    video.error = { code: 2, message: "network" };
    for (let i = 0; i < 8; i++) {
      video.fire("error");
      await vi.advanceTimersByTimeAsync(20000);
    }
    expect(events.some((e) => e.type === "error")).toBe(false);
    video.fire("error");
    expect(events.filter((e) => e.type === "error")).toHaveLength(1);

    events.length = 0;
    video.error = { code: 3, message: "decode" };
    video.fire("error");
    expect(events.filter((e) => e.type === "error")).toHaveLength(1);
  });
});
