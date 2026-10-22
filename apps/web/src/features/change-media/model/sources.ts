import { MediaType } from "@omioroom/contracts";

export interface VideoSource {
  id: string;
  label: string;
  /** Media types a link from this source resolves to. */
  types: readonly MediaType[];
  example: string;
}

/** What the picker offers. "Any link" is handled separately and accepts everything parseMediaUrl knows. */
export const VIDEO_SOURCES: readonly VideoSource[] = [
  { id: "youtube", label: "YouTube", types: [MediaType.YOUTUBE], example: "https://www.youtube.com/watch?v=…" },
  { id: "vk", label: "VK Video", types: [MediaType.VK], example: "https://vk.com/video-123_456" },
  { id: "rutube", label: "RuTube", types: [MediaType.RUTUBE], example: "https://rutube.ru/video/…/" },
  { id: "twitch", label: "Twitch", types: [MediaType.TWITCH], example: "https://www.twitch.tv/videos/…" },
  { id: "vimeo", label: "Vimeo", types: [MediaType.VIMEO], example: "https://vimeo.com/…" },
  { id: "yandex", label: "Яндекс Диск", types: [MediaType.YANDEX_DISK], example: "https://disk.yandex.ru/i/…" },
  { id: "dropbox", label: "Dropbox", types: [MediaType.HTML5], example: "https://www.dropbox.com/s/…/video.mp4" },
  { id: "file", label: "MP4 / HLS", types: [MediaType.HTML5, MediaType.HLS], example: "https://…/video.mp4 or .m3u8" },
] as const;
