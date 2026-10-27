import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  createProtocolError,
  normalizeDisplayName,
  displayNameSchema,
  privateCodeSchema,
  globalRoomIdSchema,
  parseMediaUrl,
  parseAllowedMediaUrl,
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

    // Vimeo
    const vimeo = parseMediaUrl("https://vimeo.com/76979871");
    expect(vimeo).toEqual({
      type: MediaType.VIMEO,
      sourceId: "76979871",
      canonicalUrl: "https://player.vimeo.com/video/76979871",
    });

    // Kodik
    const kodikMovie = parseMediaUrl("https://kodikplayer.com/video/91873/060cab655974d46835b3f4405807acc2/720p");
    expect(kodikMovie).toEqual({
      type: MediaType.KODIK,
      sourceId: "91873_060cab655974d46835b3f4405807acc2",
      canonicalUrl: "https://kodikplayer.com/video/91873/060cab655974d46835b3f4405807acc2/720p",
    });

    const kodikSeria = parseMediaUrl("https://kodik.info/seria/12345/abcdef0123456789?season=1&episode=2");
    expect(kodikSeria).toEqual({
      type: MediaType.KODIK,
      sourceId: "12345_abcdef0123456789",
      canonicalUrl: "https://kodik.info/seria/12345/abcdef0123456789?season=1&episode=2",
    });

    // Dzen (embed address only), Odnoklassniki, Dailymotion
    expect(parseMediaUrl("https://dzen.ru/embed/vAbCdEf123")).toEqual({
      type: MediaType.DZEN,
      sourceId: "vAbCdEf123",
      canonicalUrl: "https://dzen.ru/embed/vAbCdEf123",
    });
    expect(parseMediaUrl('<iframe src="https://dzen.ru/embed/vAbCdEf123?from_block=partner"></iframe>')?.type).toBe("dzen");
    expect(parseMediaUrl("https://dzen.ru/video/watch/64a1b2c3d4e5f6a7b8c9d0e1")).toBeNull();
    expect(parseMediaUrl("https://ok.ru/video/1234567890")).toEqual({
      type: MediaType.OK,
      sourceId: "1234567890",
      canonicalUrl: "https://ok.ru/videoembed/1234567890",
    });
    expect(parseMediaUrl("https://www.dailymotion.com/video/x8abc12")?.canonicalUrl).toBe(
      "https://www.dailymotion.com/embed/video/x8abc12"
    );
    expect(parseMediaUrl("https://dai.ly/x8abc12")?.sourceId).toBe("x8abc12");

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


  it("understands links from every supported source", () => {
    expect(parseMediaUrl("https://vk.com/video-22822305_456239018")?.type).toBe("vk");
    expect(parseMediaUrl("https://vkvideo.ru/video-22822305_456239018")?.type).toBe("vk");
    expect(parseMediaUrl("https://vk.com/video?z=video-22822305_456239018%2Fclub22822305")?.sourceId).toBe("-22822305_456239018");
    expect(parseMediaUrl("https://vk.com/video_ext.php?oid=-22822305&id=456239018&hash=abc123")?.canonicalUrl).toContain("hash=abc123");

    const rt = parseMediaUrl("https://rutube.ru/video/0123456789abcdef0123456789abcdef/");
    expect(rt?.type).toBe("rutube");
    const priv = parseMediaUrl("https://rutube.ru/video/private/0123456789abcdef0123456789abcdef/?p=SECRETKEY");
    expect(priv?.canonicalUrl).toBe("https://rutube.ru/play/embed/0123456789abcdef0123456789abcdef?p=SECRETKEY");
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
    const kodikIframe = parseMediaUrl('<iframe src="//kodikplayer.com/video/91873/060cab655974d46835b3f4405807acc2/720p" allowfullscreen></iframe>');
    expect(kodikIframe?.type).toBe("kodik");
    expect(kodikIframe?.canonicalUrl).toBe("https://kodikplayer.com/video/91873/060cab655974d46835b3f4405807acc2/720p");
  });

  it("rooms accept platforms: direct files and streams are refused", () => {
    expect(parseAllowedMediaUrl("https://www.youtube.com/watch?v=jNQXAC9IVRw")?.type).toBe("youtube");
    expect(parseAllowedMediaUrl("https://vk.com/video-126483390_456239718")?.type).toBe("vk");
    expect(parseAllowedMediaUrl("https://rutube.ru/video/a7ef5ba8f8f6a3f7d6b5aeb3ef2e7bbe/")?.type).toBe("rutube");
    expect(parseAllowedMediaUrl("https://vimeo.com/22439234")?.type).toBe("vimeo");
    expect(parseAllowedMediaUrl("https://kodikplayer.com/video/91873/060cab655974d46835b3f4405807acc2/720p")?.type).toBe("kodik");
    expect(parseAllowedMediaUrl("https://example.com/movie.mp4")).toBeNull();
    expect(parseAllowedMediaUrl("https://example.com/stream/live.m3u8")).toBeNull();
    expect(parseAllowedMediaUrl("https://example.com/movie.mp4", { allowDirectMedia: true })?.type).toBe("html5");
    expect(parseAllowedMediaUrl("https://example.com/stream/live.m3u8", { allowDirectMedia: true })?.type).toBe("hls");
    expect(parseAllowedMediaUrl("https://example.com/")).toBeNull();
    // admins: any http(s) address plays as a file
    expect(parseAllowedMediaUrl("https://abc.trycloudflare.com/film.mkv", { allowDirectMedia: true })?.type).toBe("html5");
    expect(parseAllowedMediaUrl("https://example.com/", { allowDirectMedia: true })?.type).toBe("html5");
    expect(parseAllowedMediaUrl("ftp://example.com/a.mp4", { allowDirectMedia: true })).toBeNull();
    expect(parseAllowedMediaUrl("not a url", { allowDirectMedia: true })).toBeNull();
  });
});
