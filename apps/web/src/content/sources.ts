import type { ContentPageDef, PageText } from "./types.js";

interface SourceCopy {
  path: string;
  nav: { ru: string; en: string };
  ru: { title: string; description: string; heading: string; lead: string; how: string[]; notes: string[] };
  en: { title: string; description: string; heading: string; lead: string; how: string[]; notes: string[] };
}

function build(copy: SourceCopy): ContentPageDef {
  const make = (lang: "ru" | "en"): PageText => {
    const c = copy[lang];
    const ru = lang === "ru";
    return {
      title: c.title,
      description: c.description,
      heading: c.heading,
      lead: c.lead,
      sections: [
        { heading: ru ? "Как смотреть" : "How to watch", steps: c.how },
        { heading: ru ? "Что важно знать" : "Good to know", list: c.notes },
        {
          heading: ru ? "Другие источники" : "Other sources",
          paragraphs: [
            ru
              ? "OMIOROOM работает с YouTube, VK Видео, RuTube и Vimeo."
              : "OMIOROOM works with YouTube, VK Video, RuTube and Vimeo.",
          ],
        },
      ],
    };
  };
  return { path: copy.path, group: "source", nav: copy.nav, text: { ru: make("ru"), en: make("en") } };
}

export const SOURCE_PAGES: ContentPageDef[] = [
  build({
    path: "/youtube-together",
    nav: { ru: "YouTube вместе", en: "YouTube together" },
    ru: {
      title: "Смотреть YouTube вместе с друзьями онлайн — OMIOROOM",
      description:
        "Смотрите видео с YouTube вместе: вставьте ссылку в комнату, и все увидят его синхронно. Общая пауза и перемотка, чат и голос.",
      heading: "Смотреть YouTube вместе с друзьями",
      lead: "Вставьте ссылку на ролик с YouTube в комнату OMIOROOM, и все участники увидят его в одну и ту же секунду. Пауза, перемотка и скорость у всех общие.",
      how: [
        "Создайте комнату на главной странице.",
        "Скопируйте ссылку на ролик (youtube.com/watch?v=… или youtu.be/…) и вставьте её в поле видео.",
        "Отправьте друзьям приглашение. Они откроют комнату и увидят тот же ролик.",
        "Нажмите «Играть»: воспроизведение начнётся у всех одновременно.",
      ],
      notes: [
        "Видео воспроизводится официальным плеером YouTube у каждого зрителя, мы его не копируем и не храним.",
        "Реклама, которую показывает YouTube, может отличаться у разных людей. Сервис дожидается тех, у кого видео ещё грузится.",
        "Ролики, у которых владелец запретил встраивание, показать нельзя.",
      ],
    },
    en: {
      title: "Watch YouTube together with friends online — OMIOROOM",
      description:
        "Watch YouTube videos together: paste a link into a room and everyone sees it in sync. Shared pause and seeking, chat and voice.",
      heading: "Watch YouTube together with friends",
      lead: "Paste a YouTube link into an OMIOROOM room and every participant sees the video at the same second. Pause, seeking and speed are shared.",
      how: [
        "Create a room on the home page.",
        "Copy the video link (youtube.com/watch?v=… or youtu.be/…) and paste it into the video field.",
        "Send your friends the invitation. They open the room and see the same video.",
        "Press Play: playback starts for everyone at once.",
      ],
      notes: [
        "The video plays in YouTube's official player for each viewer; we do not copy or store it.",
        "Ads shown by YouTube may differ between people. The service waits for those whose video is still loading.",
        "Videos whose owner has disabled embedding cannot be shown.",
      ],
    },
  }),
  build({
    path: "/vk-together",
    nav: { ru: "VK Видео вместе", en: "VK Video together" },
    ru: {
      title: "Смотреть VK Видео вместе с друзьями онлайн — OMIOROOM",
      description:
        "Совместный просмотр видео из VK: вставьте ссылку или код встраивания, и комната покажет ролик всем синхронно. Чат и голос.",
      heading: "Смотреть VK Видео вместе с друзьями",
      lead: "OMIOROOM показывает ролики VK Видео всем участникам комнаты синхронно. Публичные ролики открываются по обычной ссылке.",
      how: [
        "Создайте комнату на главной странице.",
        "Вставьте ссылку на ролик (vk.com/video-123_456) в поле видео.",
        "Если ролик доступен «только по ссылке», возьмите ссылку из «Поделиться → Экспортировать» (в ней есть ключ hash) или вставьте весь код встраивания.",
        "Отправьте друзьям приглашение и нажмите «Играть».",
      ],
      notes: [
        "Видео воспроизводит официальный плеер VK у каждого зрителя, мы его не храним.",
        "Плеер VK не позволяет менять скорость воспроизведения, поэтому в таких комнатах скорость остаётся обычной.",
        "Если ролик закрыт, удалён или запрещает встраивание, плеер покажет причину.",
      ],
    },
    en: {
      title: "Watch VK Video together with friends online — OMIOROOM",
      description:
        "Watch VK videos together: paste a link or embed code and the room shows the video to everyone in sync. Chat and voice.",
      heading: "Watch VK Video together with friends",
      lead: "OMIOROOM shows VK Video clips to everyone in the room in sync. Public videos open with an ordinary link.",
      how: [
        "Create a room on the home page.",
        "Paste the video link (vk.com/video-123_456) into the video field.",
        "If the video is available “by link only”, take the link from “Share → Export” (it contains a hash key) or paste the whole embed code.",
        "Send your friends the invitation and press Play.",
      ],
      notes: [
        "The video plays in VK's official player for each viewer; we do not store it.",
        "VK's player does not allow changing the playback speed, so speed stays normal in such rooms.",
        "If a video is private, deleted or does not allow embedding, the player shows the reason.",
      ],
    },
  }),
  build({
    path: "/rutube-together",
    nav: { ru: "RuTube вместе", en: "RuTube together" },
    ru: {
      title: "Смотреть RuTube вместе с друзьями онлайн — OMIOROOM",
      description:
        "Смотрите видео с RuTube вместе: вставьте ссылку в комнату, и все увидят ролик синхронно. Общая пауза и перемотка, чат и голос.",
      heading: "Смотреть RuTube вместе с друзьями",
      lead: "Вставьте ссылку на ролик RuTube в комнату OMIOROOM, и он начнётся у всех участников одновременно.",
      how: [
        "Создайте комнату на главной странице.",
        "Вставьте ссылку на ролик (rutube.ru/video/…) в поле видео. Для приватных роликов подойдёт ссылка с ключом (?p=…).",
        "Отправьте друзьям приглашение.",
        "Нажмите «Играть»: воспроизведение начнётся у всех вместе.",
      ],
      notes: [
        "Видео воспроизводит плеер RuTube у каждого зрителя, мы его не храним.",
        "Рекламные вставки считаются подвисанием: сервис подождёт тех, у кого она идёт.",
      ],
    },
    en: {
      title: "Watch RuTube together with friends online — OMIOROOM",
      description:
        "Watch RuTube videos together: paste a link into a room and everyone sees the video in sync. Shared pause and seeking, chat and voice.",
      heading: "Watch RuTube together with friends",
      lead: "Paste a RuTube link into an OMIOROOM room and the video starts for all participants at once.",
      how: [
        "Create a room on the home page.",
        "Paste the video link (rutube.ru/video/…) into the video field. For private videos, a link with the key (?p=…) works.",
        "Send your friends the invitation.",
        "Press Play: playback starts for everyone together.",
      ],
      notes: [
        "The video plays in RuTube's player for each viewer; we do not store it.",
        "Advert breaks count as a stall: the service waits for those who are watching one.",
      ],
    },
  }),
  build({
    path: "/vimeo-together",
    nav: { ru: "Vimeo вместе", en: "Vimeo together" },
    ru: {
      title: "Смотреть Vimeo вместе с друзьями онлайн — OMIOROOM",
      description:
        "Совместный просмотр видео с Vimeo: вставьте ссылку в комнату, и все увидят ролик синхронно. Чат и голос, без установки.",
      heading: "Смотреть Vimeo вместе с друзьями",
      lead: "OMIOROOM показывает видео с Vimeo всем участникам комнаты синхронно, включая закрытые ролики по ссылке с ключом.",
      how: [
        "Создайте комнату на главной странице.",
        "Вставьте ссылку на ролик (vimeo.com/…) в поле видео.",
        "Отправьте друзьям приглашение.",
        "Нажмите «Играть» и смотрите вместе.",
      ],
      notes: [
        "Видео воспроизводит официальный плеер Vimeo у каждого зрителя, мы его не храним.",
        "Скрытые ролики открываются по полной ссылке с параметром h=…",
      ],
    },
    en: {
      title: "Watch Vimeo together with friends online — OMIOROOM",
      description:
        "Watch Vimeo videos together: paste a link into a room and everyone sees the video in sync. Chat and voice, nothing to install.",
      heading: "Watch Vimeo together with friends",
      lead: "OMIOROOM shows Vimeo videos to everyone in the room in sync, including unlisted videos opened with a key link.",
      how: [
        "Create a room on the home page.",
        "Paste the video link (vimeo.com/…) into the video field.",
        "Send your friends the invitation.",
        "Press Play and watch together.",
      ],
      notes: [
        "The video plays in Vimeo's official player for each viewer; we do not store it.",
        "Unlisted videos open with the full link that includes the h=… parameter.",
      ],
    },
  }),
];
