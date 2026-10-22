import { describe, it, expect } from "vitest";
import {
  ErrorCode,
  createProtocolError,
  normalizeDisplayName,
  displayNameSchema,
  privateCodeSchema,
  globalRoomIdSchema,
  parseMediaUrl,
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
});
