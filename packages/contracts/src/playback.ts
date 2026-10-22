import { z } from "zod";

export const SYNC_THRESHOLD_IGNORE_MS = 250;
export const SYNC_THRESHOLD_DRIFT_RATE_MS = 750;

export const MediaType = {
  YOUTUBE: "youtube",
  HTML5: "html5",
} as const;

export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const mediaTypeSchema = z.nativeEnum(MediaType);

export const mediaSourceInfoSchema = z.object({
  type: mediaTypeSchema,
  sourceId: z.string().min(1),
  canonicalUrl: z.string().url(),
});

export type MediaSourceInfo = z.infer<typeof mediaSourceInfoSchema>;

export const PlaybackStatus = {
  PLAYING: "playing",
  PAUSED: "paused",
  BUFFERING: "buffering",
  ENDED: "ended",
} as const;

export type PlaybackStatus = (typeof PlaybackStatus)[keyof typeof PlaybackStatus];

export const playbackStatusSchema = z.nativeEnum(PlaybackStatus);

export const roomPlaybackStateDtoSchema = z.object({
  roomId: z.string().uuid(),
  media: mediaSourceInfoSchema.nullable(),
  status: playbackStatusSchema,
  anchorPosition: z.number().nonnegative(),
  anchorServerTime: z.number().int().positive(),
  playbackRate: z.number().positive(),
  revision: z.number().int().nonnegative(),
  updatedByUserId: z.string().uuid().nullable(),
});

export type RoomPlaybackStateDto = z.infer<typeof roomPlaybackStateDtoSchema>;

export const PlayerCommandType = {
  PLAY: "play",
  PAUSE: "pause",
  SEEK: "seek",
  CHANGE_MEDIA: "change-media",
  SET_RATE: "set-rate",
  BUFFERING: "buffering",
} as const;

export type PlayerCommandType =
  (typeof PlayerCommandType)[keyof typeof PlayerCommandType];

export const playerCommandTypeSchema = z.nativeEnum(PlayerCommandType);

export const playerCommandPayloadSchema = z.object({
  commandId: z.string().uuid(),
  roomId: z.string().uuid(),
  type: playerCommandTypeSchema,
  position: z.number().nonnegative().optional(),
  media: mediaSourceInfoSchema.optional(),
  playbackRate: z.number().positive().min(0.25).max(3.0).optional(),
  expectedRevision: z.number().int().nonnegative().optional(),
});

export type PlayerCommandPayload = z.infer<typeof playerCommandPayloadSchema>;

export function calculateExpectedPosition(
  state: RoomPlaybackStateDto,
  estimatedServerNow: number
): number {
  if (state.status !== PlaybackStatus.PLAYING) {
    return state.anchorPosition;
  }
  const elapsedSeconds = Math.max(0, (estimatedServerNow - state.anchorServerTime) / 1000);
  return state.anchorPosition + elapsedSeconds * state.playbackRate;
}

export function parseMediaUrl(inputUrl: string): MediaSourceInfo | null {
  try {
    const trimmed = inputUrl.trim();
    if (!trimmed) return null;

    const url = new URL(trimmed);

    // YouTube detection
    if (
      url.hostname === "www.youtube.com" ||
      url.hostname === "youtube.com" ||
      url.hostname === "m.youtube.com"
    ) {
      if (url.pathname === "/watch") {
        const v = url.searchParams.get("v");
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
          return {
            type: MediaType.YOUTUBE,
            sourceId: v,
            canonicalUrl: `https://www.youtube.com/watch?v=${v}`,
          };
        }
      } else if (url.pathname.startsWith("/embed/")) {
        const v = url.pathname.split("/")[2];
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
          return {
            type: MediaType.YOUTUBE,
            sourceId: v,
            canonicalUrl: `https://www.youtube.com/watch?v=${v}`,
          };
        }
      }
    }

    if (url.hostname === "youtu.be") {
      const v = url.pathname.slice(1);
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) {
        return {
          type: MediaType.YOUTUBE,
          sourceId: v,
          canonicalUrl: `https://www.youtube.com/watch?v=${v}`,
        };
      }
    }

    // Direct MP4 / WebM
    const pathnameLower = url.pathname.toLowerCase();
    if (pathnameLower.endsWith(".mp4") || pathnameLower.endsWith(".webm")) {
      return {
        type: MediaType.HTML5,
        sourceId: url.toString(),
        canonicalUrl: url.toString(),
      };
    }

    return null;
  } catch {
    return null;
  }
}
