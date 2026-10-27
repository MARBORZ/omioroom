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
import { KodikPlayerAdapter } from "../shared/lib/adapters/kodik-adapter.js";
import { snapSeekDelta } from "../widgets/video-player/ui/video-player-frame.js";
import { parseMessageText } from "../widgets/room-chat/ui/room-chat.js";
import { ChatImage } from "../widgets/room-chat/ui/chat-image.js";

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

    const htmlDoneWithoutChildren = renderToStaticMarkup(
      React.createElement(Skeleton, { loading: false })
    );
    expect(htmlDoneWithoutChildren).toBe("");

    const htmlCircle = renderToStaticMarkup(
      React.createElement(Skeleton, { shape: "circle", width: 32 })
    );
    expect(htmlCircle).toContain("--skeleton-width:32px");
    expect(htmlCircle).toContain("--skeleton-height:32px");
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
    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;

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

    try {
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
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });

  it("KodikPlayerAdapter embeds iframe, sends kodik_player_api commands, and reacts to events", async () => {
    const postMessageSpy = vi.fn();
    const mockIframe = {
      src: "",
      style: { cssText: "" },
      allow: "",
      allowFullscreen: false,
      contentWindow: {
        postMessage: postMessageSpy,
      },
    };

    const container = {
      innerHTML: "",
      appendChild: vi.fn(),
    } as unknown as HTMLElement;

    const listeners: Record<string, ((e: any) => void)[]> = {};
    const mockWindow = {
      addEventListener: vi.fn((event: string, fn: any) => {
        listeners[event] = listeners[event] || [];
        listeners[event].push(fn);
      }),
      removeEventListener: vi.fn((event: string, fn: any) => {
        if (listeners[event]) {
          listeners[event] = listeners[event].filter((l) => l !== fn);
        }
      }),
    };

    const origWindow = (globalThis as any).window;
    const origDocument = (globalThis as any).document;

    try {
      (globalThis as any).window = mockWindow;
      (globalThis as any).document = {
        createElement: vi.fn((tagName: string) => {
          if (tagName === "iframe") return mockIframe as any;
          return origDocument?.createElement ? origDocument.createElement(tagName) : {};
        }),
      };

      const adapter = new KodikPlayerAdapter();
      await adapter.attach(container);

      const media = {
        type: MediaType.KODIK,
        sourceId: "91873_060cab655974d46835b3f4405807acc2",
        canonicalUrl: "https://kodikplayer.com/video/91873/060cab655974d46835b3f4405807acc2/720p",
      };

      await adapter.loadMedia(media);
      expect(mockIframe.src).toBe(media.canonicalUrl);
      expect(container.appendChild).toHaveBeenCalledWith(mockIframe);

      // Test commands
      await adapter.play();
      expect(postMessageSpy).toHaveBeenCalledWith(
        { key: "kodik_player_api", value: { method: "play" } },
        "*"
      );

      await adapter.pause();
      expect(postMessageSpy).toHaveBeenCalledWith(
        { key: "kodik_player_api", value: { method: "pause" } },
        "*"
      );

      await adapter.seek(42);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { key: "kodik_player_api", value: { method: "seek", seconds: 42 } },
        "*"
      );

      await adapter.setPlaybackRate(1.5);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { key: "kodik_player_api", value: { method: "speed", speed: 1.5 } },
        "*"
      );

      adapter.setMuted(true);
      expect(postMessageSpy).toHaveBeenCalledWith(
        { key: "kodik_player_api", value: { method: "mute" } },
        "*"
      );

      // Test incoming events
      const events: any[] = [];
      adapter.onStateChange((e) => events.push(e));

      // Simulate play event
      const trigger = (data: any) => {
        (listeners["message"] || []).forEach((fn) =>
          fn({
            source: mockIframe.contentWindow,
            data,
          })
        );
      };

      trigger({ key: "kodik_player_play" });
      expect(events.some((e) => e.type === "play")).toBe(true);

      // Simulate time update
      trigger({ key: "kodik_player_time_update", value: 30 });
      expect(adapter.getCurrentTime()).toBeCloseTo(30, 0);

      adapter.destroy();
      expect(container.innerHTML).toBe("");
    } finally {
      (globalThis as any).window = origWindow;
      (globalThis as any).document = origDocument;
    }
  });

  it("verifies round component protection against collapsing into ovals, cinema light theme, and mobile chat styles", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

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

  it("verifies participant mute buttons, badges, and chat muted state", async () => {
    const { ParticipantsPanel } = await import("../widgets/participants-panel/ui/participants-panel.js");
    const { I18nProvider } = await import("../shared/lib/i18n/i18n-context.js");
    const { RoomChat } = await import("../widgets/room-chat/ui/room-chat.js");
    const { SessionContext } = await import("../app/providers/session-context.js");

    const mockSession = {
      timeSync: {} as any,
      connectionStatus: "connected" as any,
      sessionReady: true,
      user: { id: "user-1", displayName: "Tester", role: "member" as const },
      ensureUser: async () => ({} as any),
      updateDisplayName: async () => ({} as any),
      register: async () => ({} as any),
      login: async () => ({} as any),
      signOut: async () => {},
    };

    const participants = [
      {
        userId: "owner-id",
        displayName: "Owner",
        role: "owner" as const,
        isOnline: true,
        canControl: true,
        chatSeenAt: null,
      },
      {
        userId: "controller-id",
        displayName: "Controller",
        role: "member" as const,
        isOnline: true,
        canControl: true,
        chatSeenAt: null,
      },
      {
        userId: "ordinary-id",
        displayName: "Ordinary",
        role: "member" as const,
        isOnline: true,
        canControl: false,
        chatSeenAt: null,
      },
    ];

    // 1. Owner view with ordinary participant not muted
    const ownerHtml = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ParticipantsPanel, {
          participants,
          currentUserId: "owner-id",
          isOwner: true,
          canControl: true,
          mutedUserIds: [],
          maxParticipants: 10,
          controlMode: "selected",
          onSaveSettings: async () => {},
          onToggleControl: async () => {},
          onToggleMute: async () => {},
        })
      )
    );

    // Owner sees mute button ("Заглушить" / "Mute") for Ordinary
    expect(ownerHtml).toContain("title=\"Заглушить\"");
    // Owner does NOT have mute button for Controller or self
    expect(ownerHtml).not.toContain("title=\"Заглушить Controller\"");

    // 2. Owner view with ordinary participant muted
    const ownerMutedHtml = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ParticipantsPanel, {
          participants,
          currentUserId: "owner-id",
          isOwner: true,
          canControl: true,
          mutedUserIds: ["ordinary-id"],
          maxParticipants: 10,
          controlMode: "selected",
          onSaveSettings: async () => {},
          onToggleControl: async () => {},
          onToggleMute: async () => {},
        })
      )
    );

    // Muted badge is displayed and action button becomes "Вернуть голос"
    expect(ownerMutedHtml).toContain("title=\"Заглушён\"");
    expect(ownerMutedHtml).toContain("title=\"Вернуть голос\"");

    // 3. Ordinary member view: cannot see mute buttons for anyone
    const memberHtml = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ParticipantsPanel, {
          participants,
          currentUserId: "ordinary-id",
          isOwner: false,
          canControl: false,
          mutedUserIds: ["ordinary-id"],
          maxParticipants: 10,
          controlMode: "selected",
          onSaveSettings: async () => {},
          onToggleControl: async () => {},
          onToggleMute: async () => {},
        })
      )
    );

    // Ordinary member sees the muted badge on themselves, but NO mute action buttons
    expect(memberHtml).toContain("title=\"Заглушён\"");
    expect(memberHtml).not.toContain("title=\"Заглушить\"");
    expect(memberHtml).not.toContain("title=\"Вернуть голос\"");

    // 4. RoomChat muted state
    const chatMutedHtml = renderToStaticMarkup(
      React.createElement(
        SessionContext.Provider,
        { value: mockSession },
        React.createElement(
          I18nProvider,
          null,
          React.createElement(RoomChat, {
            messages: [],
            loading: false,
            onSend: async () => {},
            isMuted: true,
          })
        )
      )
    );

    expect(chatMutedHtml).toContain("disabled=\"\"");
    expect(chatMutedHtml).toContain("placeholder=\"Вас заглушили\"");
    expect(chatMutedHtml).toContain("Вас заглушили");

    // 5. RoomChat unmuted state
    const chatUnmutedHtml = renderToStaticMarkup(
      React.createElement(
        SessionContext.Provider,
        { value: mockSession },
        React.createElement(
          I18nProvider,
          null,
          React.createElement(RoomChat, {
            messages: [],
            loading: false,
            onSend: async () => {},
            isMuted: false,
          })
        )
      )
    );

    expect(chatUnmutedHtml).not.toContain("placeholder=\"Вас заглушили\"");
    expect(chatUnmutedHtml).toContain("placeholder=\"Текст сообщения...\"");
  });

  it("verifies registration password strength, problems, repeat match, and payload validation", async () => {
    const { checkPassword, passwordsMatch, displayNameSchema } = await import("@omioroom/contracts");
    const { ru } = await import("../shared/lib/i18n/translations/ru.js");
    const { en } = await import("../shared/lib/i18n/translations/en.js");

    // 1. Problem translations match in RU and EN
    expect(ru.onboarding.passwordProblems.too_short).toBe("Минимум 10 символов");
    expect(ru.onboarding.passwordProblems.weak_classes).toBe("Добавьте заглавную букву, цифру или символ");
    expect(ru.onboarding.passwordProblems.common).toBe("Слишком известный пароль");
    expect(ru.onboarding.passwordProblems.contains_name).toBe("Не используйте имя или почту");
    expect(ru.onboarding.passwordProblems.repetitive).toBe("Уберите повторы подряд");
    expect(ru.onboarding.passwordProblems.sequence).toBe("Уберите последовательности вроде 1234 или qwer");
    expect(ru.onboarding.passwordProblems.too_long).toBe("Не больше 72 символов");
    expect(ru.onboarding.passwordsDoNotMatch).toBe("Пароли не совпадают");

    expect(en.onboarding.passwordProblems.too_short).toBe("At least 10 characters");
    expect(en.onboarding.passwordProblems.weak_classes).toBe("Add an uppercase letter, number, or symbol");
    expect(en.onboarding.passwordsDoNotMatch).toBe("Passwords do not match");

    // 2. checkPassword logic on weak vs strong
    const weak1 = checkPassword("123", { username: "alex", email: "alex@example.com" });
    expect(weak1.ok).toBe(false);
    expect(weak1.score).toBe(0);
    expect(weak1.problems).toContain("too_short");

    const weakCommon = checkPassword("password123!", { username: "alex", email: "alex@example.com" });
    expect(weakCommon.ok).toBe(false);
    expect(weakCommon.problems).toContain("common");

    const weakName = checkPassword("MySecretAlex99!", { username: "Alex", email: "alex@example.com" });
    expect(weakName.ok).toBe(false);
    expect(weakName.problems).toContain("contains_name");

    const strong = checkPassword("Kino-Room-2026-Best!", { username: "Alex", email: "alex@example.com" });
    expect(strong.ok).toBe(true);
    expect(strong.score).toBeGreaterThanOrEqual(3);
    expect(strong.problems).toHaveLength(0);

    // 3. passwordsMatch logic
    expect(passwordsMatch("Kino-Room-2026-Best!", "Kino-Room-2026-Best!")).toBe(true);
    expect(passwordsMatch("Kino-Room-2026-Best!", "DifferentPassword123!")).toBe(false);
    expect(passwordsMatch("", "")).toBe(false);

    // 4. displayNameSchema validation for username
    expect(displayNameSchema.safeParse("alex_cinema").success).toBe(true);
    expect(displayNameSchema.safeParse("alex.cinema").success).toBe(true);
    expect(displayNameSchema.safeParse("alex-cinema").success).toBe(true);
    expect(displayNameSchema.safeParse("Alex Cinema 99").success).toBe(true);
    // Disallowed characters (e.g. @, #, $, %, ^, &, *, !, <, >)
    expect(displayNameSchema.safeParse("alex@cinema").success).toBe(false);
    expect(displayNameSchema.safeParse("alex#cinema").success).toBe(false);
    expect(displayNameSchema.safeParse("<script>").success).toBe(false);

    // 5. Render IdentityPage static markup
    const { IdentityPage } = await import("../pages/identity/ui/identity-page.js");
    const { SessionContext } = await import("../app/providers/session-context.js");
    const { I18nProvider } = await import("../shared/lib/i18n/i18n-context.js");
    const { SettingsProvider } = await import("../shared/lib/settings/settings-context.js");

    const mockSession = {
      timeSync: {} as any,
      connectionStatus: "connected" as any,
      sessionReady: true,
      user: null,
      ensureUser: async () => ({} as any),
      updateDisplayName: async () => ({} as any),
      register: async () => ({} as any),
      login: async () => ({} as any),
      signOut: async () => {},
    };

    const identityHtml = renderToStaticMarkup(
      React.createElement(
        SessionContext.Provider,
        { value: mockSession },
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(I18nProvider, null, React.createElement(IdentityPage, { onSelect: () => {} }))
        )
      )
    );

    // Identity page contains password show/hide buttons and strength meter
    expect(identityHtml).toContain("aria-label=\"Показать пароль\"");
    expect(identityHtml).toContain("strengthMeter");
    // First visit: no session -> NO "Назад" button
    expect(identityHtml).not.toContain("Назад");

    // Returning visit / from within app with onBack: HAS "Назад" button
    const identityWithBackHtml = renderToStaticMarkup(
      React.createElement(
        SessionContext.Provider,
        { value: mockSession },
        React.createElement(
          SettingsProvider,
          null,
          React.createElement(I18nProvider, null, React.createElement(IdentityPage, { onSelect: () => {}, onBack: () => {} }))
        )
      )
    );
    expect(identityWithBackHtml).toContain("Назад");
  });

  it("verifies blacklist panel and room participants banned user labels", async () => {
    const { ParticipantsPanel } = await import("../widgets/participants-panel/ui/participants-panel.js");
    const { BlacklistPanel } = await import("../widgets/blacklist-panel/ui/blacklist-panel.js");
    const { SettingsModal } = await import("../widgets/settings-modal/ui/settings-modal.js");
    const { SettingsProvider } = await import("../shared/lib/settings/settings-context.js");
    const { I18nProvider } = await import("../shared/lib/i18n/i18n-context.js");

    // 1. ParticipantsPanel with bannedUsers shows "Заблокирован во всех ваших комнатах"
    const panelWithBanned = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ParticipantsPanel, {
          participants: [],
          currentUserId: "owner-id",
          isOwner: true,
          canControl: true,
          mutedUserIds: [],
          bannedUsers: [{ userId: "banned-1", displayName: "BadActor" }],
          maxParticipants: 10,
          controlMode: "selected",
          onSaveSettings: async () => {},
        })
      )
    );
    expect(panelWithBanned).toContain("BadActor");
    expect(panelWithBanned).toContain("Заблокирован во всех ваших комнатах");
    expect(panelWithBanned).toContain("Разблокировать");

    // 2. SettingsModal owner vs non-owner
    const nonOwnerSettings = renderToStaticMarkup(
      React.createElement(
        SettingsProvider,
        null,
        React.createElement(I18nProvider, null, React.createElement(SettingsModal, { isOpen: true, onClose: () => {}, isOwner: false }))
      )
    );
    expect(nonOwnerSettings).not.toContain("Чёрный список");

    const ownerSettings = renderToStaticMarkup(
      React.createElement(
        SettingsProvider,
        null,
        React.createElement(I18nProvider, null, React.createElement(SettingsModal, { isOpen: true, onClose: () => {}, isOwner: true }))
      )
    );
    expect(ownerSettings).toContain("Чёрный список");
  });

  it("verifies direct media deprecation and allowed sources", async () => {
    const { VIDEO_SOURCES, getVideoSources } = await import("../features/change-media/model/sources.js");
    const { parseAllowedMediaUrl } = await import("@omioroom/contracts");

    // Supported platforms
    const sourceIds = VIDEO_SOURCES.map((s) => s.id);
    expect(sourceIds).toEqual(["vk", "rutube", "ok", "kodik", "youtube", "vimeo"]);
    expect(sourceIds).not.toContain("file");
    expect(sourceIds).not.toContain("hls");
    expect(getVideoSources(true).map((s) => s.id)).toContain("file");

    // Allowed platforms parse correctly
    expect(parseAllowedMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).not.toBeNull();
    expect(parseAllowedMediaUrl("https://vk.com/video-12345_67890")).not.toBeNull();
    expect(parseAllowedMediaUrl("https://rutube.ru/video/a7ef5ba8f8f6a3f7d6b5aeb3ef2e7bbe/")).not.toBeNull();
    expect(parseAllowedMediaUrl("https://vimeo.com/12345678")).not.toBeNull();
    expect(parseAllowedMediaUrl("https://kodikplayer.com/video/91873/060cab655974d46835b3f4405807acc2/720p")).not.toBeNull();

    // Direct files, HLS, or unsupported domains return null by default, but allowed when privileged
    expect(parseAllowedMediaUrl("https://example.com/video.mp4")).toBeNull();
    expect(parseAllowedMediaUrl("https://example.com/stream.m3u8")).toBeNull();
    expect(parseAllowedMediaUrl("https://example.com/video.mp4", { allowDirectMedia: true })?.type).toBe("html5");
    expect(parseAllowedMediaUrl("https://example.com/stream.m3u8", { allowDirectMedia: true })?.type).toBe("hls");
    expect(parseAllowedMediaUrl("https://ok.ru/video/1234567890")?.type).toBe("ok");
    expect(parseAllowedMediaUrl("https://dzen.ru/embed/vAbCdEf123")).toBeNull();
    expect(parseAllowedMediaUrl("https://www.dailymotion.com/video/x8abc12")).toBeNull();
  });

  it("verifies public feed and report modal rendering", async () => {
    const { PublicFeed } = await import("../widgets/public-feed/ui/public-feed.js");
    const { ReportModal } = await import("../widgets/report-modal/ui/report-modal.js");
    const { I18nProvider } = await import("../shared/lib/i18n/i18n-context.js");

    // Report modal rendering
    const modalHtml = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(ReportModal, {
          isOpen: true,
          target: { type: "room", roomId: "r1" },
          onClose: () => {},
        })
      )
    );
    expect(modalHtml).toContain("Пожаловаться");
    expect(modalHtml).toContain("Недопустимое видео");
    expect(modalHtml).toContain("Оскорбления");
    expect(modalHtml).toContain("Спам");
    expect(modalHtml).toContain("Другое");

    // Public feed empty state
    const feedHtml = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(PublicFeed, { onJoinRoom: () => {} })
      )
    );
    expect(feedHtml).toContain("Сейчас смотрят");
  });

  it("verifies playback action indicator translations and delta formatting", () => {
    expect(ru.room.actionPaused).toBe("ПАУЗА");
    expect(ru.room.actionResumed).toBe("ВОСПРОИЗВЕДЕНИЕ");
    expect(ru.room.actionSeekForward).toBe("ПЕРЕМОТКА ВПЕРЁД");
    expect(ru.room.actionSeekBackward).toBe("ПЕРЕМОТКА НАЗАД");
    expect(ru.room.you).toBe("Вы");

    expect(en.room.actionPaused).toBe("PAUSED");
    expect(en.room.actionResumed).toBe("PLAYING");
    expect(en.room.actionSeekForward).toBe("SEEK FORWARD");
    expect(en.room.actionSeekBackward).toBe("SEEK BACKWARD");
    expect(en.room.you).toBe("You");

    expect(ru.room.secondsShort(10)).toBe("10 сек");
    expect(en.room.secondsShort(10)).toBe("10s");
    expect(ru.room.minutesShort(2)).toBe("2 мин");
    expect(en.room.minutesShort(2)).toBe("2m");
    expect(ru.room.minutesSecondsShort(1, 30)).toBe("1 мин 30 сек");
    expect(en.room.minutesSecondsShort(1, 30)).toBe("1m 30s");
  });

  it("snaps seek delta to clean multiples of 5 (preventing +9s or -11s jitter)", () => {
    // 10-second seeks with slight network / debounce jitter
    expect(snapSeekDelta(9.1)).toBe(10);
    expect(snapSeekDelta(9.4)).toBe(10);
    expect(snapSeekDelta(10.0)).toBe(10);
    expect(snapSeekDelta(10.8)).toBe(10);
    expect(snapSeekDelta(-9.2)).toBe(10);
    expect(snapSeekDelta(-10.9)).toBe(10);

    // Multi-skip aggregation (20s, 30s)
    expect(snapSeekDelta(19.3)).toBe(20);
    expect(snapSeekDelta(20.7)).toBe(20);
    expect(snapSeekDelta(29.1)).toBe(30);

    // 5-second skip
    expect(snapSeekDelta(4.8)).toBe(5);
    expect(snapSeekDelta(5.2)).toBe(5);

    // Manual slider scrubs with non-multiple-of-5 offsets
    expect(snapSeekDelta(32.0)).toBe(32);
    expect(snapSeekDelta(13.0)).toBe(13);

    // Clamped seek to beginning of video (e.g. from 3s to 0s)
    expect(snapSeekDelta(-3.2, 0)).toBe(3);
  });

  it("robustly parses chat quote/reply headers and multiline bodies", () => {
    // Standard reply
    const r1 = parseMessageText("> [msg-123|Amadi]: Привет всем\nКак дела?");
    expect(r1.reply).toEqual({
      id: "msg-123",
      senderName: "Amadi",
      snippet: "Привет всем",
    });
    expect(r1.body).toBe("Как дела?");

    // Reply to photo with emoji snippet
    const r2 = parseMessageText("> [msg-456|Masuev]: 📷 Фото\nКлассный кадр");
    expect(r2.reply).toEqual({
      id: "msg-456",
      senderName: "Masuev",
      snippet: "📷 Фото",
    });
    expect(r2.body).toBe("Классный кадр");

    // Reply with no body (e.g. only image attachment or empty text)
    const r3 = parseMessageText("> [msg-789|User]: 📷 Фото\n");
    expect(r3.reply).toEqual({
      id: "msg-789",
      senderName: "User",
      snippet: "📷 Фото",
    });
    expect(r3.body).toBe("");

    // Reply without trailing newline
    const r4 = parseMessageText("> [msg-999|User]: Цитата");
    expect(r4.reply).toEqual({
      id: "msg-999",
      senderName: "User",
      snippet: "Цитата",
    });
    expect(r4.body).toBe("");

    // Multiline body preserved
    const r5 = parseMessageText("> [msg-111|Alex]: Header\nLine 1\nLine 2\nLine 3");
    expect(r5.reply).toEqual({
      id: "msg-111",
      senderName: "Alex",
      snippet: "Header",
    });
    expect(r5.body).toBe("Line 1\nLine 2\nLine 3");

    // Regular non-reply message
    const r6 = parseMessageText("Просто сообщение без цитаты");
    expect(r6.reply).toBeUndefined();
    expect(r6.body).toBe("Просто сообщение без цитаты");
  });

  it("ChatImage renders skeleton placeholder while loading", () => {
    const html = renderToStaticMarkup(
      React.createElement(ChatImage, {
        path: "room-1/test.png",
        openLabel: "Open",
        className: {
          imageContainer: "img-container",
          imageSkeleton: "img-skeleton",
          shimmerEffect: "shimmer",
          imagePlaceholder: "img-placeholder",
        },
      })
    );
    expect(html).toContain("img-skeleton");
    expect(html).toContain("shimmer");
  });
});
