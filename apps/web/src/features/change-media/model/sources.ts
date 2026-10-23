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
  { id: "vimeo", label: "Vimeo", types: [MediaType.VIMEO], example: "https://vimeo.com/…" },
] as const;
