import { z } from "zod";

export const SYNC_THRESHOLD_IGNORE_MS = 250;
export const SYNC_THRESHOLD_DRIFT_RATE_MS = 750;
/** A stall must last this long before the room is held (ignores micro-stutters). */
export const BUFFER_STALL_DEBOUNCE_MS = 700;
/** The room waits this long for a stalled leader (must match buffer_wait_ms() in the database). */
export const BUFFER_WAIT_TIMEOUT_MS = 10000;
/** Enough data buffered ahead to report "ready". */
export const BUFFER_READY_AHEAD_SECONDS = 1.5;

export const MediaType = {
  YOUTUBE: "youtube",
  HTML5: "html5",
  VK: "vk",
  RUTUBE: "rutube",
  VIMEO: "vimeo",
  HLS: "hls",
} as const;

export type MediaType = (typeof MediaType)[keyof typeof MediaType];

export const mediaTypeSchema = z.nativeEnum(MediaType);

export const mediaSourceInfoSchema = z.object({
  type: mediaTypeSchema,
  sourceId: z.string().min(1),
  canonicalUrl: z
    .string()
    .url()
    .refine((value) => /^https?:\/\//i.test(value), "Only http(s) media URLs are allowed"),
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
  /** Participants whose player is stalled; the room waits for them (up to 5 s). */
  bufferingBy: z.array(z.string().uuid()).default([]),
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
    let trimmed = inputUrl.trim();
    if (!trimmed) return null;

    // A whole embed snippet was pasted (e.g. VK's "Share -> Export"): use its src
    const iframeSrc = trimmed.match(/<iframe[^>]*\ssrc\s*=\s*["']([^"']+)["']/i);
    if (iframeSrc?.[1]) {
      trimmed = iframeSrc[1].replace(/&amp;/g, "&");
      if (trimmed.startsWith("//")) trimmed = `https:${trimmed}`;
    }

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

    const pathnameLower = url.pathname.toLowerCase();

    // Direct MP4 / WebM / OGG / MOV
    if (
      pathnameLower.endsWith(".mp4") ||
      pathnameLower.endsWith(".webm") ||
      pathnameLower.endsWith(".ogg") ||
      pathnameLower.endsWith(".mov")
    ) {
      return {
        type: MediaType.HTML5,
        sourceId: url.toString(),
        canonicalUrl: url.toString(),
      };
    }

    // HLS Stream (.m3u8)
    if (pathnameLower.endsWith(".m3u8") || url.pathname.includes(".m3u8")) {
      return {
        type: MediaType.HLS,
        sourceId: url.toString(),
        canonicalUrl: url.toString(),
      };
    }

    // VK Video
    if (
      url.hostname === "vk.com" ||
      url.hostname === "www.vk.com" ||
      url.hostname === "vkvideo.ru" ||
      url.hostname === "m.vk.com"
    ) {
      // Embed URL from VK's "Share -> Export" (carries the hash that makes the video embeddable)
      if (url.pathname === "/video_ext.php") {
        const oid = url.searchParams.get("oid");
        const id = url.searchParams.get("id");
        const hash = url.searchParams.get("hash") || "";
        if (oid && id) {
          const host = url.hostname === "vkvideo.ru" ? "vkvideo.ru" : "vk.com";
          return {
            type: MediaType.VK,
            sourceId: `${oid}_${id}_${hash}`,
            canonicalUrl: `https://${host}/video_ext.php?oid=${oid}&id=${id}${hash ? `&hash=${hash}` : ""}&autoplay=0`,
          };
        }
      }

      // Standard link: /video-123456_789012, or the "?z=video-123_456" form VK uses in feeds
      const vkMatch = url.pathname.match(/\/video(-?\d+)_(\d+)/) ?? (url.searchParams.get("z") ?? "").match(/video(-?\d+)_(\d+)/);
      if (vkMatch) {
        const [, oid, id] = vkMatch;
        return {
          type: MediaType.VK,
          sourceId: `${oid}_${id}`,
          canonicalUrl: `https://vk.com/video_ext.php?oid=${oid}&id=${id}&autoplay=0`,
        };
      }
    }

    // RuTube (public: /video/<id>/, private: /video/private/<id>/?p=<key>)
    if (url.hostname === "rutube.ru" || url.hostname === "www.rutube.ru") {
      const match = url.pathname.match(/\/(?:video(?:\/private)?|play\/embed)\/([a-fA-F0-9]{32})/);
      if (match && match[1]) {
        const id = match[1];
        const key = url.searchParams.get("p");
        return {
          type: MediaType.RUTUBE,
          sourceId: id,
          canonicalUrl: `https://rutube.ru/play/embed/${id}${key ? `?p=${encodeURIComponent(key)}` : ""}`,
        };
      }
    }

    // Vimeo (unlisted videos carry a hash: /<id>/<hash> or ?h=<hash>)
    if (url.hostname === "vimeo.com" || url.hostname === "www.vimeo.com" || url.hostname === "player.vimeo.com") {
      const match = url.pathname.match(/(?:video\/|\/)(\d+)(?:\/([a-f0-9]{6,}))?/);
      if (match && match[1]) {
        const hash = match[2] ?? url.searchParams.get("h");
        return {
          type: MediaType.VIMEO,
          sourceId: match[1],
          canonicalUrl: `https://player.vimeo.com/video/${match[1]}${hash ? `?h=${hash}` : ""}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}
