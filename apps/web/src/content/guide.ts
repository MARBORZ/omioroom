import type { ContentPageDef } from "./types.js";

export const GUIDE_PAGES: ContentPageDef[] = [
  {
    path: "/how-it-works",
    group: "guide",
    nav: { ru: "Как это работает", en: "How it works" },
    text: {
      ru: {
        title: "Как смотреть видео вместе онлайн: как работает OMIOROOM",
        description:
          "Создайте комнату, отправьте ссылку друзьям и смотрите видео синхронно: пауза и перемотка у всех одновременно. Чат, голос, без установки.",
        heading: "Как это работает",
        lead: "OMIOROOM — это общая комната, где все смотрят одно видео в одну и ту же секунду. Ничего ставить не нужно: достаточно браузера на компьютере, телефоне или планшете.",
        sections: [
          {
            heading: "Четыре шага",
            steps: [
              "Откройте сайт и нажмите «Создать комнату». Войти можно без аккаунта: имя назначится само.",
              "Вставьте ссылку на видео: YouTube, VK Видео, RuTube или Vimeo.",
              "Отправьте друзьям ссылку-приглашение или шестизначный номер комнаты.",
              "Нажмите «Играть»: видео стартует у всех одновременно. Пауза и перемотка тоже общие.",
            ],
          },
          {
            heading: "Как достигается синхронность",
            paragraphs: [
              "Сервис хранит одно общее состояние комнаты: что играет, на какой секунде, с какой скоростью. Каждый плеер сверяет своё время с этим состоянием и подстраивается: чуть ускоряется, замедляется или перематывается при большой разнице. Обычное расхождение — меньше полусекунды.",
              "Видео не проходит через наши серверы: каждый зритель получает его напрямую от источника. Мы синхронизируем только команды.",
              "Если видео подвисло у человека, который управляет, остальные ждут его и продолжают вместе. Если подвисло у остальных, никого не останавливают: они сами догоняют.",
            ],
          },
          {
            heading: "Кто управляет видео",
            paragraphs: ["Владелец выбирает режим комнаты:"],
            list: [
              "все участники управляют плеером;",
              "управляют владелец и избранные им участники;",
              "управляет только владелец.",
            ],
          },
          {
            heading: "Комнаты на 2–32 человека",
            paragraphs: [
              "Комната может быть открытой (вход по номеру) или закрытой (нужен приватный ключ, который видит только владелец). Владелец может убрать или заблокировать участника и заглушить того, кто мешает.",
              "Комната живёт, пока ею пользуются: если в ней никого не было 7 дней, она удаляется сама. Владелец может закрыть её раньше.",
            ],
          },
          {
            heading: "Чат и голос",
            paragraphs: [
              "В комнате есть текстовый чат с картинками и гифками, отметки «прочитано» и голосовой чат до 8 человек. Голос передаётся напрямую между участниками и не записывается.",
            ],
          },
        ],
      },
      en: {
        title: "How to watch videos together online: how OMIOROOM works",
        description:
          "Create a room, send the link to friends and watch videos in sync: pause and seek happen for everyone at once. Chat and voice, nothing to install.",
        heading: "How it works",
        lead: "OMIOROOM is a shared room where everyone watches the same video at the same second. There is nothing to install: a browser on a computer, phone or tablet is enough.",
        sections: [
          {
            heading: "Four steps",
            steps: [
              "Open the site and press “Create room”. You can join without an account: a name is assigned for you.",
              "Paste a video link: YouTube, VK Video, RuTube or Vimeo.",
              "Send your friends the invitation link or the six-digit room number.",
              "Press Play: the video starts for everyone at once. Pause and seeking are shared too.",
            ],
          },
          {
            heading: "How sync works",
            paragraphs: [
              "The service keeps one shared room state: what is playing, at which second and at what speed. Each player compares its time with that state and adjusts: it speeds up slightly, slows down or seeks when the gap is large. The usual difference is under half a second.",
              "The video does not pass through our servers: every viewer gets it directly from the source. We only synchronize the commands.",
              "If the video stalls for the person in control, the others wait and continue together. If it stalls for someone else, nobody is stopped: they catch up on their own.",
            ],
          },
          {
            heading: "Who controls the video",
            paragraphs: ["The owner chooses the room mode:"],
            list: [
              "everyone controls the player;",
              "the owner and people they pick control it;",
              "only the owner controls it.",
            ],
          },
          {
            heading: "Rooms for 2–32 people",
            paragraphs: [
              "A room can be open (join by number) or private (a private key, visible only to the owner, is required). The owner can remove or ban a participant and mute anyone who disturbs the room.",
              "A room lives while it is used: if nobody has been inside for 7 days it deletes itself. The owner can close it earlier.",
            ],
          },
          {
            heading: "Chat and voice",
            paragraphs: [
              "Each room has a text chat with pictures and GIFs, read receipts and a voice chat for up to 8 people. Voice goes directly between participants and is not recorded.",
            ],
          },
        ],
      },
    },
  },
];
