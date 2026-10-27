import { z } from "zod";

/** A difference below this is normal and never corrected. */
export const SYNC_THRESHOLD_IGNORE_MS = 500;
/** Above this, the player is moved to the room position; between the two it is only nudged with a slight speed change. */
export const SYNC_THRESHOLD_DRIFT_RATE_MS = 1000;
/** A stall must last this long before the room is held (ignores micro-stutters). */
export const BUFFER_STALL_DEBOUNCE_MS = 1200;
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
  KODIK: "kodik",
  DZEN: "dzen",
  OK: "ok",
  DAILYMOTION: "dailymotion",
} as const;

/** Players that offer no control API: the room shows them but cannot start, pause or seek them for everyone. */
export const UNSYNCED_MEDIA_TYPES: readonly MediaType[] = [MediaType.DZEN, MediaType.OK, MediaType.DAILYMOTION];

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
  /** Set when automatic moderation removed the video (reason code, for example "title"); cleared by the next video. */
  mediaBlocked: z.string().nullable().optional(),
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
    }
    if (trimmed.startsWith("//")) {
      trimmed = `https:${trimmed}`;
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

    // Dzen: only the embed address works (Share -> Embed under the video); /video/watch/ links cannot be embedded
    if (["dzen.ru", "www.dzen.ru", "zen.yandex.ru"].includes(url.hostname)) {
      const match = url.pathname.match(/^\/embed\/([A-Za-z0-9_-]{6,64})\/?$/);
      if (match?.[1]) {
        return { type: MediaType.DZEN, sourceId: match[1], canonicalUrl: `https://dzen.ru/embed/${match[1]}` };
      }
    }

    // Odnoklassniki: /video/<id>, /videoembed/<id>
    if (["ok.ru", "www.ok.ru", "m.ok.ru"].includes(url.hostname)) {
      const match = url.pathname.match(/^\/(?:video|videoembed)\/(\d{5,20})\/?$/);
      if (match?.[1]) {
        return { type: MediaType.OK, sourceId: match[1], canonicalUrl: `https://ok.ru/videoembed/${match[1]}` };
      }
    }

    // Dailymotion: /video/<id>, /embed/video/<id>, dai.ly/<id>, geo.dailymotion.com/player.html?video=<id>
    if (url.hostname === "dai.ly" || url.hostname === "dailymotion.com" || url.hostname.endsWith(".dailymotion.com")) {
      const id =
        url.hostname === "dai.ly"
          ? url.pathname.slice(1)
          : (url.pathname.match(/^\/(?:embed\/)?video\/([A-Za-z0-9]+)/)?.[1] ?? url.searchParams.get("video") ?? "");
      if (/^[A-Za-z0-9]{5,20}$/.test(id)) {
        return { type: MediaType.DAILYMOTION, sourceId: id, canonicalUrl: `https://www.dailymotion.com/embed/video/${id}` };
      }
    }

    // Kodik (movies, series, anime: /video/<id>/<hash>, /seria/<id>/<hash>, /serial/<id>/<hash>)
    const hostLower = url.hostname.toLowerCase();
    const isKodikHost =
      hostLower.endsWith("kodikplayer.com") ||
      hostLower.endsWith("kodik.info") ||
      hostLower.endsWith("kodik.biz") ||
      hostLower.endsWith("kodik.cc") ||
      hostLower.endsWith("aniqit.com") ||
      hostLower.endsWith("anivod.com");

    if (isKodikHost) {
      const match = url.pathname.match(/\/(video|seria|serial)\/(\d+)\/([a-zA-Z0-9]+)(?:\/([a-zA-Z0-9]+))?/);
      if (match) {
        const [, kind, id, hash, quality] = match;
        const qualityPart = quality ? `/${quality}` : "";
        const search = url.search || "";
        return {
          type: MediaType.KODIK,
          sourceId: `${id}_${hash}`,
          canonicalUrl: `https://${hostLower}/${kind}/${id}/${hash}${qualityPart}${search}`,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

/** Media types played from a link to a file or stream on any site; no longer supported in rooms. */
export const DIRECT_MEDIA_TYPES: readonly MediaType[] = [MediaType.HTML5, MediaType.HLS];

/**
 * Like parseMediaUrl, but only for what rooms accept: YouTube, VK Video, RuTube, Vimeo and Kodik.
 * Direct files and streams return null unless allowDirectMedia is explicitly enabled.
 */
export function parseAllowedMediaUrl(
  inputUrl: string,
  options?: { allowDirectMedia?: boolean }
): MediaSourceInfo | null {
  const parsed = parseMediaUrl(inputUrl);
  if (options?.allowDirectMedia) {
    if (parsed && /^https?:\/\//i.test(parsed.canonicalUrl)) return parsed;
    // Admins are not limited to known platforms: any http(s) address is played as a file (or an HLS stream)
    try {
      const url = new URL(inputUrl.trim());
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      const type = url.pathname.toLowerCase().includes(".m3u8") ? MediaType.HLS : MediaType.HTML5;
      return { type, sourceId: url.toString(), canonicalUrl: url.toString() };
    } catch {
      return null;
    }
  }
  if (!parsed) return null;
  return !DIRECT_MEDIA_TYPES.includes(parsed.type) ? parsed : null;
}
