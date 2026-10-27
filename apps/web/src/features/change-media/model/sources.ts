import { MediaType } from "@omioroom/contracts";

export type SourceGroup = "ru" | "world" | "admin";

export interface VideoSource {
  id: string;
  label: string;
  group: SourceGroup;
  /** Media types a link from this source resolves to. */
  types: readonly MediaType[];
  example: string;
}

/** What the picker offers, grouped: the Russian segment, the global one and (admins only) direct files. "Any link" accepts every one of them. */
export const VIDEO_SOURCES: readonly VideoSource[] = [
  { id: "vk", label: "VK Видео", group: "ru", types: [MediaType.VK], example: "https://vk.com/video-123_456" },
  { id: "rutube", label: "RuTube", group: "ru", types: [MediaType.RUTUBE], example: "https://rutube.ru/video/…/" },
  { id: "dzen", label: "Дзен", group: "ru", types: [MediaType.DZEN], example: "https://dzen.ru/embed/…" },
  { id: "ok", label: "Одноклассники", group: "ru", types: [MediaType.OK], example: "https://ok.ru/video/…" },
  { id: "kodik", label: "Кино и сериалы (Kodik)", group: "ru", types: [MediaType.KODIK], example: "https://kodikplayer.com/video/…" },
  { id: "youtube", label: "YouTube", group: "world", types: [MediaType.YOUTUBE], example: "https://www.youtube.com/watch?v=…" },
  { id: "vimeo", label: "Vimeo", group: "world", types: [MediaType.VIMEO], example: "https://vimeo.com/…" },
  { id: "dailymotion", label: "Dailymotion", group: "world", types: [MediaType.DAILYMOTION], example: "https://www.dailymotion.com/video/…" },
] as const;

export const FILE_SOURCE: VideoSource = {
  id: "file",
  label: "MP4 / HLS",
  group: "admin",
  types: [MediaType.HTML5, MediaType.HLS],
  example: "https://…/video.mp4 or .m3u8",
};

export function getVideoSources(isPrivileged = false): readonly VideoSource[] {
  return isPrivileged ? [...VIDEO_SOURCES, FILE_SOURCE] : VIDEO_SOURCES;
}
