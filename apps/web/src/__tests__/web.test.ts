import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatTime } from "../shared/lib/format-time.js";
import { formatRoomExpiration, pluralRu } from "../shared/lib/format-expiration.js";
import { generateClientRequestId } from "../shared/api/backend.js";
import { en } from "../shared/lib/i18n/translations/en.js";
import { ru } from "../shared/lib/i18n/translations/ru.js";
import { Skeleton } from "../shared/ui/skeleton/skeleton.js";
import { Loader } from "../shared/ui/loader/loader.js";
import { MediaType, parseMediaUrl } from "@omioroom/contracts";
import { YouTubePlayerAdapter } from "../shared/lib/adapters/youtube-adapter.js";

describe("Web Utilities", () => {
  it("formats time correctly for mm:ss and hh:mm:ss", () => {
    expect(formatTime(0)).toBe("00:00");
    expect(formatTime(45)).toBe("00:45");
    expect(formatTime(65)).toBe("01:05");
    expect(formatTime(3600)).toBe("1:00:00");
    expect(formatTime(3665)).toBe("1:01:05");
    expect(formatTime(-10)).toBe("00:00");
  });

  it("formats room auto-delete expiration and pluralization correctly", () => {
    expect(pluralRu(1, "день", "дня", "дней")).toBe("день");
    expect(pluralRu(2, "день", "дня", "дней")).toBe("дня");
    expect(pluralRu(5, "день", "дня", "дней")).toBe("дней");
    expect(pluralRu(11, "день", "дня", "дней")).toBe("дней");
    expect(pluralRu(21, "день", "дня", "дней")).toBe("день");
    expect(pluralRu(24, "день", "дня", "дней")).toBe("дня");

    const baseNow = 1_700_000_000_000;

    // null or undefined expiresAt -> null
    expect(formatRoomExpiration(null, baseNow, ru)).toBeNull();
    expect(formatRoomExpiration(undefined, baseNow, ru)).toBeNull();

    // 6 days 23 hours in the future
    const in6d23h = new Date(baseNow + (6 * 24 + 23) * 3600_000).toISOString();
    const expRu = formatRoomExpiration(in6d23h, baseNow, ru);
    expect(expRu).toEqual({ text: "Удалится через 6 д 23 ч", isUrgent: false });
    const expEn = formatRoomExpiration(in6d23h, baseNow, en);
    expect(expEn).toEqual({ text: "Deletes in 6d 23h", isUrgent: false });

    // Under 24h: 4h 15m
    const in4h15m = new Date(baseNow + (4 * 60 + 15) * 60_000).toISOString();
    expect(formatRoomExpiration(in4h15m, baseNow, ru)).toEqual({
      text: "Удалится через 4 ч 15 мин",
      isUrgent: false,
    });
    expect(formatRoomExpiration(in4h15m, baseNow, en)).toEqual({
      text: "Deletes in 4h 15m",
      isUrgent: false,
    });

    // Under 1h: 42m -> isUrgent: true
    const in42m = new Date(baseNow + 42 * 60_000).toISOString();
    expect(formatRoomExpiration(in42m, baseNow, ru)).toEqual({
      text: "Удалится через 42 мин",
      isUrgent: true,
    });
    expect(formatRoomExpiration(in42m, baseNow, en)).toEqual({
      text: "Deletes in 42m",
      isUrgent: true,
    });

    // Already expired
    const expired = new Date(baseNow - 5_000).toISOString();
    expect(formatRoomExpiration(expired, baseNow, ru)).toEqual({
      text: "Удалится меньше чем через минуту",
      isUrgent: true,
    });
  });

  it("generates valid client request IDs", () => {
    const id1 = generateClientRequestId();
    const id2 = generateClientRequestId();
    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(id1).not.toBe(id2);
  });

  it("has the same i18n keys in EN and RU and no empty strings", () => {
    const keys = (obj: Record<string, unknown>, prefix = ""): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? keys(v as Record<string, unknown>, `${prefix}${k}.`) : [`${prefix}${k}`]
      );
    expect(keys(ru as unknown as Record<string, unknown>).sort()).toEqual(
      keys(en as unknown as Record<string, unknown>).sort()
    );

    const empties = (obj: Record<string, unknown>): string[] =>
      Object.entries(obj).flatMap(([k, v]) =>
        v && typeof v === "object" ? empties(v as Record<string, unknown>) : v === "" ? [k] : []
      );
    expect(empties(en as unknown as Record<string, unknown>)).toEqual([]);
    expect(empties(ru as unknown as Record<string, unknown>)).toEqual([]);
    expect(en.common.brand).toBe("OMIOROOM");
    expect(ru.common.brand).toBe("OMIOROOM");
  });

  it("Skeleton handles loading prop correctly", () => {
    const htmlLoading = renderToStaticMarkup(
      React.createElement(
        Skeleton,
        { loading: true },
        React.createElement("span", null, "Loaded content")
      )
    );
    expect(htmlLoading).toContain('aria-hidden="true"');
    expect(htmlLoading).not.toContain("Loaded content");

    const htmlDone = renderToStaticMarkup(
      React.createElement(
        Skeleton,
        { loading: false },
        React.createElement("span", null, "Loaded content")
      )
    );
    expect(htmlDone).toContain("Loaded content");
    expect(htmlDone).not.toContain('aria-hidden="true"');
  });

  it("Loader handles loading prop correctly", () => {
    const htmlLoading = renderToStaticMarkup(
      React.createElement(Loader, { loading: true, label: "Please wait" })
    );
    expect(htmlLoading).toContain('role="status"');
    expect(htmlLoading).toContain("Please wait");

    const htmlDone = renderToStaticMarkup(
      React.createElement(
        Loader,
        { loading: false, label: "Please wait" },
        React.createElement("div", null, "Actual app")
      )
    );
    expect(htmlDone).toContain("Actual app");
    expect(htmlDone).not.toContain('role="status"');
  });

  it("verifies MEDIA_ALREADY_LOADED translations and identical media checking", () => {
    expect(ru.room.mediaAlreadyLoaded).toBe("Это видео уже играет");
    expect(en.room.mediaAlreadyLoaded).toBe("This video is already playing");
    expect(ru.room.commandFailed).toBe("Не получилось, попробуйте ещё раз");
    expect(en.room.commandFailed).toBe("Action failed, please try again");

    // YouTube URL variations parse to identical type and sourceId
    const yt1 = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const yt2 = parseMediaUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(yt1).not.toBeNull();
    expect(yt2).not.toBeNull();
    expect(yt1!.type).toBe(MediaType.YOUTUBE);
    expect(yt2!.type).toBe(MediaType.YOUTUBE);
    expect(yt1!.sourceId).toBe("dQw4w9WgXcQ");
    expect(yt2!.sourceId).toBe("dQw4w9WgXcQ");

    // Same media comparison logic matching ChangeMediaInput
    const isSame = (currentMedia: any, parsed: any) =>
      Boolean(
        currentMedia &&
          parsed &&
          parsed.type === currentMedia.type &&
          ((parsed.sourceId && currentMedia.sourceId && parsed.sourceId === currentMedia.sourceId) ||
            parsed.canonicalUrl === currentMedia.canonicalUrl)
      );

    expect(isSame(yt1, yt2)).toBe(true);

    const yt3 = parseMediaUrl("https://www.youtube.com/watch?v=another1234");
    expect(isSame(yt1, yt3)).toBe(false);

    // Vimeo identical check
    const vimeo1 = parseMediaUrl("https://vimeo.com/76979871");
    const vimeo2 = parseMediaUrl("https://player.vimeo.com/video/76979871");
    expect(isSame(vimeo1, vimeo2)).toBe(true);

    // VK identical check
    const vk1 = parseMediaUrl("https://vk.com/video-123456_789012");
    const vk2 = parseMediaUrl("https://vkvideo.ru/video-123456_789012");
    expect(isSame(vk1, vk2)).toBe(true);

    // MP4 canonicalUrl check
    const mp4_1 = parseMediaUrl("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
    const mp4_2 = parseMediaUrl("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
    expect(isSame(mp4_1, mp4_2)).toBe(true);
  });

  it("YouTubePlayerAdapter uses cueVideoById on existing player and destroys cleanly", async () => {
    const cueFn = vi.fn();
    const loadFn = vi.fn();
    const destroyFn = vi.fn();

    const fakePlayer = {
      cueVideoById: cueFn,
      loadVideoById: loadFn,
      destroy: destroyFn,
      getCurrentTime: () => 10,
      getDuration: () => 120,
    };

    (globalThis as any).window = globalThis;
    (globalThis as any).document = {
      getElementById: vi.fn(() => null),
      createElement: vi.fn(() => ({})),
      body: { appendChild: vi.fn() },
    };
    (globalThis as any).window.YT = {
      Player: vi.fn((_target: any, options: any) => {
        setTimeout(() => options?.events?.onReady?.(), 10);
        return fakePlayer;
      }),
    };

    const container = { innerHTML: "" } as unknown as HTMLElement;
    const adapter = new YouTubePlayerAdapter();
    await adapter.attach(container);

    // Initial load creates player
    const media1 = {
      type: MediaType.YOUTUBE,
      canonicalUrl: "https://www.youtube.com/watch?v=vid1",
      sourceId: "vid1",
    };
    await adapter.loadMedia(media1);

    // Simulate player ready
    (adapter as any).player = fakePlayer;
    (adapter as any).isReady = true;

    // Load second media on existing ready player -> must use cueVideoById, NEVER loadVideoById
    const media2 = {
      type: MediaType.YOUTUBE,
      canonicalUrl: "https://www.youtube.com/watch?v=vid2",
      sourceId: "vid2",
    };
    await adapter.loadMedia(media2);

    expect(cueFn).toHaveBeenCalledWith("vid2", 0);
    expect(loadFn).not.toHaveBeenCalled();

    // Destroy clears container and destroys player
    adapter.destroy();
    expect(destroyFn).toHaveBeenCalled();
    expect(container.innerHTML).toBe("");
  });

  it("verifies round component protection against collapsing into ovals, cinema light theme, and mobile chat styles", () => {
    const fs = require("node:fs");
    const path = require("node:path");

    const chatScss = fs.readFileSync(
      path.resolve(__dirname, "../widgets/room-chat/ui/room-chat.module.scss"),
      "utf-8"
    );
    const roomScss = fs.readFileSync(
      path.resolve(__dirname, "../pages/room/ui/room-page.module.scss"),
      "utf-8"
    );

    // 1. Reply button has locked dimensions and aspect-ratio 1 / 1 to prevent collapsing into oval
    expect(chatScss).toContain(".replyActionBtn");
    expect(chatScss).toContain("aspect-ratio: 1 / 1 !important;");
    expect(chatScss).toContain("border-radius: 50% !important;");
    expect(chatScss).toContain("max-width: calc(100% - 38px);");

    // 2. Cinema mode video controls have white overrides for high contrast in light theme
    expect(roomScss).toContain("--color-text: #ffffff;");
    expect(roomScss).toContain("color: #ffffff !important;");

    // 3. Mobile chat overlay has 50vw in landscape and 100vw in fullscreen
    expect(roomScss).toContain(".mobileChatOverlay");
    expect(roomScss).toContain("width: 50vw;");
    expect(roomScss).toContain("width: 100vw;");
  });
});
