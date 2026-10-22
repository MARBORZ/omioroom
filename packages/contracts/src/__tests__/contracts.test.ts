import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  createProtocolError,
  normalizeDisplayName,
  displayNameSchema,
  privateCodeSchema,
  globalRoomIdSchema,
  parseMediaUrl,
  mediaSourceInfoSchema,
  calculateExpectedPosition,
  MediaType,
  PlaybackStatus,
  createRoomPayloadSchema,
  commandEnvelopeSchema,
  PROTOCOL_VERSION,
} from "../index.js";

describe("Contracts and Domain Logic", () => {
  it("normalizes display names correctly", () => {
    expect(normalizeDisplayName("  Quiet Fox  ")).toBe("quiet fox");
    expect(normalizeDisplayName("Cool   Watcher")).toBe("cool watcher");
  });

  it("validates display name schema", () => {
    expect(displayNameSchema.safeParse("Alex").success).toBe(true);
    expect(displayNameSchema.safeParse("A").success).toBe(false); // too short
    expect(displayNameSchema.safeParse("a".repeat(31)).success).toBe(false); // too long
  });

  it("validates 6-digit global room id", () => {
    expect(globalRoomIdSchema.safeParse("123456").success).toBe(true);
    expect(globalRoomIdSchema.safeParse("12345").success).toBe(false); // 5 digits
    expect(globalRoomIdSchema.safeParse("1234567").success).toBe(false); // 7 digits
    expect(globalRoomIdSchema.safeParse("abcdef").success).toBe(false); // letters
  });

  it("validates private code schema", () => {
    expect(privateCodeSchema.safeParse("secret-1234").success).toBe(true);
    expect(privateCodeSchema.safeParse("123").success).toBe(false); // too short
  });

  it("parses various YouTube and HTML5 URLs correctly", () => {
    // Standard YouTube
    const yt1 = parseMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(yt1).toEqual({
      type: MediaType.YOUTUBE,
      sourceId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    // Short youtu.be
    const yt2 = parseMediaUrl("https://youtu.be/dQw4w9WgXcQ");
    expect(yt2).toEqual({
      type: MediaType.YOUTUBE,
      sourceId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    // Embed YouTube
    const yt3 = parseMediaUrl("https://www.youtube.com/embed/dQw4w9WgXcQ");
    expect(yt3).toEqual({
      type: MediaType.YOUTUBE,
      sourceId: "dQw4w9WgXcQ",
      canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    });

    // MP4 file
    const mp4 = parseMediaUrl("https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4");
    expect(mp4).toEqual({
      type: MediaType.HTML5,
      sourceId: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      canonicalUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    });

    // HLS Stream
    const hls = parseMediaUrl("https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8");
    expect(hls).toEqual({
      type: MediaType.HLS,
      sourceId: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
      canonicalUrl: "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8",
    });

    // VK Video
    const vk = parseMediaUrl("https://vk.com/video-123456_789012");
    expect(vk).toEqual({
      type: MediaType.VK,
      sourceId: "-123456_789012",
      canonicalUrl: "https://vk.com/video_ext.php?oid=-123456&id=789012&autoplay=0",
    });

    // RuTube
    const rutube = parseMediaUrl("https://rutube.ru/video/e1c07cf27599052bfae6f477033cb24f/");
    expect(rutube).toEqual({
      type: MediaType.RUTUBE,
      sourceId: "e1c07cf27599052bfae6f477033cb24f",
      canonicalUrl: "https://rutube.ru/play/embed/e1c07cf27599052bfae6f477033cb24f",
    });

    // Twitch VOD and Channel
    const twitchVod = parseMediaUrl("https://www.twitch.tv/videos/123456789");
    expect(twitchVod).toEqual({
      type: MediaType.TWITCH,
      sourceId: "v123456789",
      canonicalUrl: "https://www.twitch.tv/videos/123456789",
    });

    const twitchChannel = parseMediaUrl("https://www.twitch.tv/shroud");
    expect(twitchChannel).toEqual({
      type: MediaType.TWITCH,
      sourceId: "shroud",
      canonicalUrl: "https://www.twitch.tv/shroud",
    });

    // Vimeo
    const vimeo = parseMediaUrl("https://vimeo.com/76979871");
    expect(vimeo).toEqual({
      type: MediaType.VIMEO,
      sourceId: "76979871",
      canonicalUrl: "https://player.vimeo.com/video/76979871",
    });

    // Invalid url
    expect(parseMediaUrl("not-a-url")).toBeNull();
    expect(parseMediaUrl("https://example.com/movie.avi")).toBeNull();
  });

  it("calculates expected position with elapsed time and playback rate", () => {
    const anchorServerTime = 1000000;
    const anchorPosition = 10; // seconds

    const playingState = {
      roomId: "00000000-0000-0000-0000-000000000000",
      media: null,
      status: PlaybackStatus.PLAYING,
      anchorPosition,
      anchorServerTime,
      playbackRate: 1.0,
      revision: 1,
      updatedByUserId: null,
    };

    // 5 seconds elapsed at 1.0x rate -> position should be 15
    expect(calculateExpectedPosition(playingState, anchorServerTime + 5000)).toBe(15);

    // 5 seconds elapsed at 1.5x rate -> position should be 10 + 7.5 = 17.5
    expect(
      calculateExpectedPosition({ ...playingState, playbackRate: 1.5 }, anchorServerTime + 5000)
    ).toBe(17.5);

    // Paused state -> position should not advance
    const pausedState = {
      ...playingState,
      status: PlaybackStatus.PAUSED,
    };
    expect(calculateExpectedPosition(pausedState, anchorServerTime + 5000)).toBe(10);
  });

  it("validates command envelope structure", () => {
    const envelopeSchema = commandEnvelopeSchema(createRoomPayloadSchema);

    const validEnvelope = {
      requestId: "a81bc81b-dead-4e5d-abff-90865d1e13b1",
      protocolVersion: PROTOCOL_VERSION,
      payload: {
        title: "Movie Night",
        visibility: "public" as const,
      },
    };

    const parsed = envelopeSchema.safeParse(validEnvelope);
    expect(parsed.success).toBe(true);

    const invalidEnvelope = {
      requestId: "not-a-uuid",
      protocolVersion: 2, // wrong version
      payload: {},
    };
    expect(envelopeSchema.safeParse(invalidEnvelope).success).toBe(false);
  });

  it("creates structured protocol errors", () => {
    const error = createProtocolError(ErrorCode.ROOM_FULL, "Room has reached the maximum 2 members", false);
    expect(error.code).toBe("ROOM_FULL");
    expect(error.retryable).toBe(false);
  });

  it("rejects non-http(s) canonical media URLs", () => {
    const base = { type: "html5" as const, sourceId: "x" };
    expect(mediaSourceInfoSchema.safeParse({ ...base, canonicalUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(mediaSourceInfoSchema.safeParse({ ...base, canonicalUrl: "https://a.com/v.mp4" }).success).toBe(true);
  });

  it("turns Dropbox share links into streamable direct links", () => {
    const parsed = parseMediaUrl("https://www.dropbox.com/s/abc123/movie.mp4?dl=0");
    expect(parsed?.type).toBe("html5");
    expect(parsed?.canonicalUrl).toBe("https://www.dropbox.com/s/abc123/movie.mp4?raw=1");
  });

  it("understands links from every supported source", () => {
    expect(parseMediaUrl("https://vk.com/video-22822305_456239018")?.type).toBe("vk");
    expect(parseMediaUrl("https://vkvideo.ru/video-22822305_456239018")?.type).toBe("vk");
    expect(parseMediaUrl("https://vk.com/video?z=video-22822305_456239018%2Fclub22822305")?.sourceId).toBe("-22822305_456239018");
    expect(parseMediaUrl("https://vk.com/video_ext.php?oid=-22822305&id=456239018&hash=abc123")?.canonicalUrl).toContain("hash=abc123");

    const rt = parseMediaUrl("https://rutube.ru/video/0123456789abcdef0123456789abcdef/");
    expect(rt?.type).toBe("rutube");
    const priv = parseMediaUrl("https://rutube.ru/video/private/0123456789abcdef0123456789abcdef/?p=SECRETKEY");
    expect(priv?.canonicalUrl).toBe("https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef?p=SECRETKEY");

    expect(parseMediaUrl("https://www.twitch.tv/videos/123456789")?.sourceId).toBe("v123456789");
    expect(parseMediaUrl("https://vimeo.com/76979871")?.canonicalUrl).toBe("https://player.vimeo.com/video/76979871");
    expect(parseMediaUrl("https://vimeo.com/76979871/abcdef123456")?.canonicalUrl).toBe(
      "https://player.vimeo.com/video/76979871?h=abcdef123456"
    );
    expect(parseMediaUrl("https://example.com/stream/live.m3u8")?.type).toBe("hls");
    expect(parseMediaUrl("https://example.com/movie.mp4")?.type).toBe("html5");
    expect(parseMediaUrl("https://example.com/page")).toBeNull();
  });

  it("extracts the source from a pasted embed snippet", () => {
    const snippet =
      '<iframe src="https://vk.com/video_ext.php?oid=-22822305&amp;id=456239018&amp;hash=abc123def&amp;hd=2" width="640" height="360" allowfullscreen></iframe>';
    const parsed = parseMediaUrl(snippet);
    expect(parsed?.type).toBe("vk");
    expect(parsed?.canonicalUrl).toContain("hash=abc123def");
    const ru = parseMediaUrl('<iframe src="//vkvideo.ru/video_ext.php?oid=1&id=2&hash=ff00"></iframe>');
    expect(ru?.canonicalUrl.startsWith("https://vkvideo.ru/")).toBe(true);
  });
});
