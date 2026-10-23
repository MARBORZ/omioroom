import type { ContentPageDef } from "./types.js";

export const FAQ_PAGE: ContentPageDef = {
  path: "/faq",
  group: "faq",
  nav: { ru: "Вопросы и ответы", en: "FAQ" },
  text: {
    ru: {
      title: "Частые вопросы об OMIOROOM: совместный просмотр видео",
      description:
        "Ответы на частые вопросы: нужен ли аккаунт, сколько человек в комнате, какие видео можно смотреть, как работает синхронизация, голос и приватность.",
      heading: "Частые вопросы",
      lead: "Коротко о том, как пользоваться OMIOROOM. Если не нашли ответ, напишите нам.",
      sections: [],
      faq: [
        {
          question: "Нужен ли аккаунт, чтобы смотреть вместе?",
          answer:
            "Нет. Можно войти без аккаунта (имя назначится само), с придуманным именем или с аккаунтом по почте и паролю. Аккаунт нужен, например, для списка друзей.",
        },
        {
          question: "Сколько человек может быть в комнате?",
          answer: "От 2 до 32. Размер выбирает владелец, его можно менять. Голосовой чат рассчитан на 8 человек.",
        },
        {
          question: "Какие видео можно смотреть?",
          answer:
            "Ролики YouTube, VK Видео, RuTube и Vimeo: у этих площадок есть собственная модерация и возрастные ограничения. Личные файлы и ссылки на другие сайты не поддерживаются, как и подписочные сервисы (Netflix, Disney+ и подобные).",
        },
        {
          question: "Видео проходит через ваши серверы?",
          answer:
            "Нет. Каждый зритель получает видео напрямую от источника. Мы храним только состояние комнаты: что играет, на какой секунде и с какой скоростью.",
        },
        {
          question: "Как достигается синхронность?",
          answer:
            "Все плееры сверяются с одним общим состоянием комнаты и подстраиваются под него. Обычное расхождение — меньше полусекунды. Если видео подвисло у управляющего, остальные ждут.",
        },
        {
          question: "Кто может ставить на паузу и перематывать?",
          answer:
            "Это решает владелец: все участники, владелец с избранными или только владелец. Режим можно менять в любой момент.",
        },
        {
          question: "Как закрыть комнату от посторонних?",
          answer:
            "Сделайте комнату закрытой. Войти можно только по приватному ключу, который видит владелец. Ключ можно сменить или отозвать в любой момент.",
        },
        {
          question: "Что делать с мешающим участником?",
          answer:
            "Владелец может убрать участника (он сможет вернуться), заблокировать его (вернуться нельзя) или заглушить: он не сможет писать в чат, а его микрофон отключится. Владелец и те, кому дали управление, заглушить нельзя.",
        },
        {
          question: "Записывается ли голос и чат?",
          answer:
            "Голос передаётся напрямую между участниками и не записывается. Сообщения чата хранятся, пока существует комната, и удаляются вместе с ней.",
        },
        {
          question: "Сколько живёт комната?",
          answer:
            "Пока ею пользуются. Если в комнате никого не было 7 дней, она удаляется вместе с чатом. Любой заход сбрасывает отсчёт. Владелец может закрыть комнату раньше.",
        },
        {
          question: "Что будет, если я просто вышел из комнаты?",
          answer:
            "Если вы владелец, комната сохранится со всеми данными, и вы вернётесь в неё из «Моих комнат». Если вы участник, вы выходите из списка и возвращаетесь по номеру, ссылке или ключу.",
        },
        {
          question: "Видео не синхронизируется или нет звука. Что делать?",
          answer:
            "Нажмите на экран видео (браузеры не разрешают звук без касания), проверьте соединение и обновите страницу: комната вернётся в актуальное состояние. Если проблема останется, напишите нам.",
        },
        {
          question: "Работает ли сервис на телефоне?",
          answer:
            "Да, в браузере на телефоне и планшете, ничего ставить не нужно. Есть режим кино: большое видео и чат сбоку.",
        },
      ],
    },
    en: {
      title: "OMIOROOM FAQ: watching videos together",
      description:
        "Answers to common questions: do I need an account, how many people fit in a room, which videos work, how sync, voice and privacy work.",
      heading: "Frequently asked questions",
      lead: "A short guide to using OMIOROOM. If you cannot find an answer, write to us.",
      sections: [],
      faq: [
        {
          question: "Do I need an account to watch together?",
          answer:
            "No. You can join without an account (a name is assigned), with a name you choose, or with an account by email and password. An account is needed for things like the friends list.",
        },
        {
          question: "How many people can be in a room?",
          answer: "From 2 to 32. The owner picks the size and can change it. Voice chat is built for 8 people.",
        },
        {
          question: "Which videos can we watch?",
          answer:
            "YouTube, VK Video, RuTube and Vimeo videos: these platforms have their own moderation and age restrictions. Personal files and links to other sites are not supported, nor are subscription services (Netflix, Disney+ and similar).",
        },
        {
          question: "Does the video pass through your servers?",
          answer:
            "No. Every viewer gets the video directly from its source. We only store the room state: what is playing, at which second and at what speed.",
        },
        {
          question: "How is sync achieved?",
          answer:
            "All players compare themselves with one shared room state and adjust to it. The usual difference is under half a second. If the video stalls for the person in control, the others wait.",
        },
        {
          question: "Who can pause and seek?",
          answer:
            "The owner decides: everyone, the owner with chosen people, or only the owner. The mode can be changed at any time.",
        },
        {
          question: "How do I keep strangers out?",
          answer:
            "Make the room private. Entry requires the private key that only the owner sees. The key can be changed or revoked at any time.",
        },
        {
          question: "What can I do about a disruptive participant?",
          answer:
            "The owner can remove them (they may come back), ban them (they cannot return) or mute them: they cannot write in the chat and their microphone is switched off. The owner and people given control cannot be muted.",
        },
        {
          question: "Are voice and chat recorded?",
          answer:
            "Voice goes directly between participants and is not recorded. Chat messages are kept while the room exists and are deleted with it.",
        },
        {
          question: "How long does a room live?",
          answer:
            "While it is used. If nobody has been inside for 7 days, it is deleted with its chat. Any visit resets the countdown. The owner can close the room earlier.",
        },
        {
          question: "What happens if I just leave the room?",
          answer:
            "If you are the owner, the room is kept with all its data and you return to it from “My rooms”. If you are a participant, you leave the list and return by number, link or key.",
        },
        {
          question: "The video is out of sync or silent. What should I do?",
          answer:
            "Tap the video (browsers do not allow sound without a tap), check your connection and reload the page: the room returns to its current state. If it persists, write to us.",
        },
        {
          question: "Does it work on a phone?",
          answer:
            "Yes, in the browser on phones and tablets, nothing to install. There is a cinema mode: a large video with the chat on the side.",
        },
      ],
    },
  },
};
