import type { Lang } from "./types.js";

/** Page metadata (title, description, social preview) per interface language. */
export interface PageMeta {
  title: string;
  description: string;
  shortDescription: string;
  imageAlt: string;
  locale: string;
  alternateLocale: string;
}

export const PAGE_META: Record<Lang, PageMeta> = {
  ru: {
    title: "OMIOROOM — смотрите видео вместе с друзьями",
    description:
      "OMIOROOM: смотрите YouTube, VK Видео, RuTube, Vimeo и прямые видео вместе с друзьями. Синхронный плеер, чат с картинками и голосовой чат. Комнаты на 2–32 человека, без установки.",
    shortDescription: "Синхронный плеер, чат и голос. Комнаты на 2–32 человека, без установки.",
    imageAlt: "OMIOROOM: два кольца и надпись «Смотрите видео вместе с друзьями»",
    locale: "ru_RU",
    alternateLocale: "en_US",
  },
  en: {
    title: "OMIOROOM — watch videos together with friends",
    description:
      "OMIOROOM: watch YouTube, VK Video, RuTube, Vimeo and direct videos together with friends. Synced player, chat with images and voice chat. Rooms for 2–32 people, nothing to install.",
    shortDescription: "Synced player, chat and voice. Rooms for 2–32 people, nothing to install.",
    imageAlt: "OMIOROOM: two rings and the line “Watch videos together with friends”",
    locale: "en_US",
    alternateLocale: "ru_RU",
  },
};
