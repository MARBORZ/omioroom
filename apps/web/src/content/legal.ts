import type { ContentPageDef } from "./types.js";
import { CONTACT_EMAIL, LEGAL_UPDATED } from "./site.js";

export const LEGAL_PAGES: ContentPageDef[] = [
  {
    path: "/rules",
    group: "legal",
    nav: { ru: "Правила", en: "Rules" },
    text: {
      ru: {
        title: "Правила использования OMIOROOM",
        description: "Условия пользования сервисом совместного просмотра OMIOROOM: что разрешено, что запрещено, ответственность и модерация комнат.",
        heading: "Правила использования",
        updated: LEGAL_UPDATED.ru,
        lead: "Используя OMIOROOM, вы соглашаетесь с этими правилами. Они короткие и написаны простым языком.",
        sections: [
          {
            heading: "1. О сервисе",
            paragraphs: [
              "OMIOROOM — веб-сервис, который синхронизирует просмотр видео между участниками комнаты и даёт чат и голосовое общение. Сервис не хранит и не распространяет видео: ролики воспроизводятся у каждого зрителя из стороннего источника (YouTube, VK Видео, RuTube или Vimeo).",
            ],
          },
          {
            heading: "2. Кто может пользоваться",
            paragraphs: [
              "Сервисом можно пользоваться с 14 лет. Если вы младше, пользуйтесь им только вместе с родителями или законными представителями. Вы отвечаете за свои действия и за сохранность своего аккаунта и пароля.",
            ],
          },
          {
            heading: "3. Что запрещено",
            list: [
              "публиковать и показывать видео, изображения и текст, нарушающие закон, чужие авторские и иные права, в том числе незаконный контент и контент, разжигающий ненависть или призывающий к насилию;",
              "оскорблять, преследовать, травить и обманывать других участников, рассылать спам и рекламу;",
              "выдавать себя за другого человека и использовать имена, вводящие в заблуждение;",
              "нарушать работу сервиса: перегружать его запросами, подбирать номера комнат и ключи, искать и использовать уязвимости, обходить ограничения и блокировки;",
              "создавать большое число аккаунтов или комнат для обхода лимитов.",
            ],
          },
          {
            heading: "4. Контент и авторские права",
            paragraphs: [
              "Вы отвечаете за ссылки, которые добавляете в комнату, за сообщения и изображения в чате. Добавляйте только то, что вправе показывать участникам. Мы не проверяем содержимое сторонних источников и не несём за него ответственности.",
              "Если вы считаете, что в комнате нарушены ваши права, напишите нам на " + CONTACT_EMAIL + ": укажите номер комнаты и суть претензии, и мы рассмотрим обращение.",
            ],
          },
          {
            heading: "5. Комнаты и модерация",
            paragraphs: [
              "Владелец комнаты управляет ей: выбирает, кто управляет плеером, может убрать, заблокировать или заглушить участника, закрыть комнату или сделать её закрытой. Участники должны выполнять разумные требования владельца.",
              "Мы вправе ограничить доступ, удалить комнату или аккаунт, если они используются в нарушение этих правил или закона.",
            ],
          },
          {
            heading: "6. Открытые комнаты",
            paragraphs: [
              "В открытую комнату может войти любой, кто знает её номер. Всё, что вы пишете и показываете в ней, видят все её участники, в том числе незнакомые люди: имя, сообщения, изображения, видео и ваше присутствие. Не публикуйте в открытых комнатах личные данные (адреса, телефоны, документы, пароли) и не делитесь тем, что должно остаться между друзьями. Для закрытого общения используйте закрытую комнату.",
              "Владелец открытой комнаты отвечает за то, что в ней происходит, и должен убирать нарушителей. Если в открытой комнате нарушаются эти правила, напишите нам на " + CONTACT_EMAIL + " с номером комнаты, и мы примем меры, вплоть до закрытия комнаты.",
            ],
          },
          {
            heading: "7. Срок жизни комнат и данных",
            paragraphs: [
              "Комната удаляется вместе с чатом, если в ней никого не было 7 дней, или раньше по решению владельца. Подробности о данных описаны в Политике обработки данных.",
            ],
          },
          {
            heading: "8. Доступность и ответственность",
            paragraphs: [
              "Сервис предоставляется «как есть». Мы стараемся поддерживать его работу, но не гарантируем бесперебойность и точность синхронизации: она зависит от вашего соединения, устройства и стороннего источника видео.",
              "Насколько это допускает закон, мы не отвечаем за косвенные убытки, потерю данных, недоступность сторонних источников и действия других участников.",
            ],
          },
          {
            heading: "9. Изменения правил",
            paragraphs: [
              "Мы можем обновлять эти правила. Новая редакция вступает в силу с момента публикации на этой странице; дата последнего изменения указана вверху. Продолжая пользоваться сервисом, вы принимаете новую редакцию.",
            ],
          },
          {
            heading: "10. Связь",
            paragraphs: ["Вопросы, жалобы и обращения: " + CONTACT_EMAIL + "."],
          },
        ],
      },
      en: {
        title: "OMIOROOM Terms of Use",
        description: "Terms for using the OMIOROOM watch-together service: what is allowed, what is not, liability and room moderation.",
        heading: "Terms of use",
        updated: LEGAL_UPDATED.en,
        lead: "By using OMIOROOM you agree to these terms. They are short and written in plain language.",
        sections: [
          {
            heading: "1. About the service",
            paragraphs: [
              "OMIOROOM is a web service that synchronizes video playback between the participants of a room and provides chat and voice communication. The service does not store or distribute videos: they play for each viewer from a third-party source (YouTube, VK Video, RuTube or Vimeo).",
            ],
          },
          {
            heading: "2. Who can use it",
            paragraphs: [
              "You must be at least 14 years old. If you are younger, use the service only together with a parent or legal guardian. You are responsible for your actions and for the security of your account and password.",
            ],
          },
          {
            heading: "3. What is not allowed",
            list: [
              "posting or showing videos, images or text that break the law or infringe others' copyright or other rights, including illegal content and content that incites hatred or violence;",
              "insulting, harassing, stalking or deceiving other participants, sending spam or advertising;",
              "impersonating another person or using misleading names;",
              "disrupting the service: overloading it with requests, guessing room numbers and keys, looking for or exploiting vulnerabilities, bypassing limits and blocks;",
              "creating many accounts or rooms to get around limits.",
            ],
          },
          {
            heading: "4. Content and copyright",
            paragraphs: [
              "You are responsible for the links you add to a room and for the messages and images in the chat. Add only what you have the right to show to the participants. We do not check the content of third-party sources and are not responsible for it.",
              "If you believe your rights are infringed in a room, write to " + CONTACT_EMAIL + " with the room number and the nature of the claim, and we will review it.",
            ],
          },
          {
            heading: "5. Rooms and moderation",
            paragraphs: [
              "The room owner manages the room: chooses who controls the player, can remove, ban or mute a participant, close the room or make it private. Participants must follow the owner's reasonable requests.",
              "We may restrict access or delete a room or account that is used in breach of these terms or the law.",
            ],
          },
          {
            heading: "6. Open rooms",
            paragraphs: [
              "Anyone who knows the number of an open room can enter it. Everything you write and show in it is visible to all its participants, including strangers: your name, messages, images, videos and presence. Do not post personal data (addresses, phone numbers, documents, passwords) in open rooms and do not share what should stay between friends. For private conversation use a private room.",
              "The owner of an open room is responsible for what happens in it and should remove offenders. If these terms are broken in an open room, write to us at " + CONTACT_EMAIL + " with the room number and we will take action, up to closing the room.",
            ],
          },
          {
            heading: "7. Lifetime of rooms and data",
            paragraphs: [
              "A room is deleted with its chat if nobody has been inside for 7 days, or earlier by the owner's decision. Details about data are in the Data Processing Policy.",
            ],
          },
          {
            heading: "8. Availability and liability",
            paragraphs: [
              "The service is provided “as is”. We try to keep it running but do not guarantee uninterrupted operation or the precision of synchronization: it depends on your connection, device and the third-party video source.",
              "To the extent permitted by law, we are not liable for indirect losses, loss of data, unavailability of third-party sources or the actions of other participants.",
            ],
          },
          {
            heading: "9. Changes to the terms",
            paragraphs: [
              "We may update these terms. The new version takes effect when published on this page; the date of the last change is shown at the top. By continuing to use the service you accept the new version.",
            ],
          },
          {
            heading: "10. Contact",
            paragraphs: ["Questions, complaints and requests: " + CONTACT_EMAIL + "."],
          },
        ],
      },
    },
  },
  {
    path: "/privacy",
    group: "legal",
    nav: { ru: "Обработка данных", en: "Privacy" },
    text: {
      ru: {
        title: "Политика обработки данных OMIOROOM",
        description: "Какие данные OMIOROOM обрабатывает, зачем, как долго хранит и как их удалить: аккаунты, чат, комнаты, голос, технические данные.",
        heading: "Политика обработки данных",
        updated: LEGAL_UPDATED.ru,
        lead: "Здесь описано, какие данные обрабатывает OMIOROOM, зачем, как долго они хранятся и как вы можете ими управлять. Мы собираем только то, что нужно для работы комнат.",
        sections: [
          {
            heading: "1. Кто обрабатывает данные",
            paragraphs: [
              "Данные обрабатывает владелец проекта OMIOROOM (далее — Оператор). Связаться с Оператором по вопросам данных можно по адресу " + CONTACT_EMAIL + ".",
            ],
          },
          {
            heading: "2. Какие данные и зачем",
            list: [
              "Аккаунт: случайное имя (для входа без аккаунта), имя, которое вы выбрали, и для зарегистрированных — адрес электронной почты и пароль. Пароль хранится только в виде необратимого хеша у провайдера входа. Нужны, чтобы вас видели в комнатах и вы могли вернуться.",
              "Комната: номер, настройки (размер, режим управления, открытая или закрытая), приватный ключ (хранится только в виде хеша), список участников и их права, ссылка на видео и состояние воспроизведения. Нужны для работы комнаты и синхронизации.",
              "Чат: тексты сообщений, изображения, отметки «прочитано», отметки о заглушении. Нужны для общения в комнате.",
              "Голос: звук передаётся напрямую между участниками (WebRTC) и нами не записывается и не хранится. Участники голосового чата видят технические адреса друг друга, это особенность такой передачи. Для установления соединения используется служба STUN.",
              "Технические данные: IP-адрес и сведения о браузере в журналах провайдеров хостинга и базы данных, моменты активности в комнате (для отображения «в сети» и удаления неактивных). Нужны для безопасности и работы сервиса.",
              "Настройки в браузере (localStorage): язык, тема, выбранный способ входа, ширина панели чата, служебные данные сессии. Рекламных и аналитических cookie мы не используем.",
            ],
          },
          {
            heading: "3. Основания и согласие",
            paragraphs: [
              "Мы обрабатываем данные, чтобы предоставить вам сервис, обеспечить его безопасность и выполнить требования закона. Начиная пользоваться сервисом и создавая аккаунт или комнату, вы соглашаетесь с обработкой данных на этих условиях.",
            ],
          },
          {
            heading: "4. Как долго хранятся данные",
            list: [
              "Комната вместе с чатом удаляется, если в ней никого не было 7 дней, или раньше при закрытии владельцем. Записи о закрытой комнате полностью удаляются через 3 дня.",
              "Участник, который не был в сети 10 минут, убирается из списка комнаты.",
              "Анонимные аккаунты, которыми не пользовались 30 дней и которые не состоят в активных комнатах, удаляются.",
              "Изображения из чата удаляются владельцем при закрытии комнаты и при плановой очистке хранилища.",
              "Журналы провайдеров хранятся в сроки, которые определяют эти провайдеры.",
            ],
          },
          {
            heading: "5. Кому передаются данные",
            paragraphs: [
              "Мы не продаём данные и не используем их для рекламы. Для работы сервиса мы используем провайдеров, которые обрабатывают данные по нашему поручению: хостинг сайта (Vercel), базу данных, вход, хранилище и обмен сообщениями (Supabase). Их серверы могут находиться в разных странах.",
              "Видео воспроизводят плееры сторонних площадок (YouTube, VK Видео, RuTube, Vimeo). Эти площадки могут собирать данные по своим правилам, когда ролик загружается у вас в браузере.",
              "Для установления голосовой связи используется публичный STUN-сервер Google. Участники комнаты видят то, что вы публикуете в ней: имя, сообщения, изображения, ваше присутствие.",
              "Открытая комната доступна любому, кто знает её номер, поэтому её содержимое (имена, сообщения, изображения) видят и незнакомые люди. В голосовом чате участники видят сетевые адреса друг друга: в открытых комнатах включайте голос, только если доверяете собеседникам. В закрытой комнате данные видят только те, кто вошёл по ключу.",
            ],
          },
          {
            heading: "6. Безопасность",
            paragraphs: [
              "Доступ к данным ограничен правилами базы: участник видит только свои комнаты. Соединение шифруется (HTTPS). Приватные ключи и пароли хранятся только в виде хешей. Все поля ввода проверяются, а запросы к базе параметризованы. Но ни один сервис в интернете не может гарантировать абсолютную защиту.",
            ],
          },
          {
            heading: "7. Ваши права",
            paragraphs: [
              "Вы можете запросить доступ к своим данным, исправление или удаление аккаунта и данных, отозвать согласие. Напишите на " + CONTACT_EMAIL + " с адреса, указанного в аккаунте, и мы ответим в разумный срок. Имя без аккаунта можно сменить прямо в приложении. Вы всегда можете закрыть свою комнату, и она удалится вместе с чатом.",
            ],
          },
          {
            heading: "8. Дети",
            paragraphs: [
              "Сервис не предназначен для детей младше 14 лет. Если вам стало известно, что ребёнок младше этого возраста оставил данные без согласия родителей, напишите нам, и мы удалим их.",
            ],
          },
          {
            heading: "9. Изменения политики",
            paragraphs: [
              "Мы можем обновлять политику. Новая редакция публикуется на этой странице, дата последнего изменения указана вверху.",
            ],
          },
        ],
      },
      en: {
        title: "OMIOROOM Data Processing Policy",
        description: "What data OMIOROOM processes, why, how long it is kept and how to delete it: accounts, chat, rooms, voice and technical data.",
        heading: "Data processing policy",
        updated: LEGAL_UPDATED.en,
        lead: "This page explains what data OMIOROOM processes, why, how long it is kept and how you can manage it. We collect only what rooms need to work.",
        sections: [
          {
            heading: "1. Who processes the data",
            paragraphs: [
              "The data is processed by the owner of the OMIOROOM project (the Operator). You can contact the Operator about data at " + CONTACT_EMAIL + ".",
            ],
          },
          {
            heading: "2. What data and why",
            list: [
              "Account: a random name (for joining without an account), a name you choose and, for registered users, an email address and a password. The password is stored only as an irreversible hash by the sign-in provider. This lets others see you in rooms and lets you come back.",
              "Room: the number, settings (size, control mode, open or private), the private key (stored only as a hash), the participant list and their rights, the video link and the playback state. This makes rooms and synchronization work.",
              "Chat: message texts, images, read receipts and mute marks. This enables communication in the room.",
              "Voice: audio goes directly between participants (WebRTC) and is not recorded or stored by us. Voice chat participants can see each other's network addresses, which is inherent in this kind of transfer. A STUN service is used to set up the connection.",
              "Technical data: IP address and browser details in the logs of the hosting and database providers, and activity times in a room (to show who is online and remove inactive people). This serves security and operation.",
              "Browser settings (localStorage): language, theme, chosen way of signing in, chat panel width and session data. We do not use advertising or analytics cookies.",
            ],
          },
          {
            heading: "3. Basis and consent",
            paragraphs: [
              "We process data to provide the service, keep it secure and meet legal requirements. By starting to use the service and by creating an account or a room, you agree to the processing on these terms.",
            ],
          },
          {
            heading: "4. How long data is kept",
            list: [
              "A room with its chat is deleted if nobody has been inside for 7 days, or earlier when the owner closes it. Records of a closed room are removed completely after 3 days.",
              "A participant who has been offline for 10 minutes is removed from the room list.",
              "Anonymous accounts unused for 30 days and not in any active room are deleted.",
              "Chat images are removed when the owner closes the room and during scheduled storage cleanup.",
              "Provider logs are kept for the periods set by those providers.",
            ],
          },
          {
            heading: "5. Who the data is shared with",
            paragraphs: [
              "We do not sell data or use it for advertising. To run the service we use providers who process data on our behalf: site hosting (Vercel), database, sign-in, storage and messaging (Supabase). Their servers may be located in different countries.",
              "Videos are played by third-party players (YouTube, VK Video, RuTube, Vimeo). Those platforms may collect data under their own rules when a video loads in your browser.",
              "A public Google STUN server is used to set up voice connections. Room participants see what you publish in it: your name, messages, images and presence.",
              "An open room is available to anyone who knows its number, so its content (names, messages, images) is also seen by strangers. In voice chat, participants can see each other's network addresses: in open rooms, switch voice on only if you trust the others. In a private room, only people who entered with the key see the data.",
            ],
          },
          {
            heading: "6. Security",
            paragraphs: [
              "Access to data is restricted by database rules: a participant sees only their own rooms. The connection is encrypted (HTTPS). Private keys and passwords are stored only as hashes. All input fields are validated and database queries are parameterized. Still, no internet service can guarantee absolute security.",
            ],
          },
          {
            heading: "7. Your rights",
            paragraphs: [
              "You can request access to your data, correction or deletion of your account and data, and withdraw consent. Write to " + CONTACT_EMAIL + " from the address on the account and we will reply within a reasonable time. A name without an account can be changed in the app. You can always close your room and it is deleted with its chat.",
            ],
          },
          {
            heading: "8. Children",
            paragraphs: [
              "The service is not intended for children under 14. If you learn that a child below that age has left data without parental consent, write to us and we will delete it.",
            ],
          },
          {
            heading: "9. Changes to this policy",
            paragraphs: [
              "We may update this policy. The new version is published on this page; the date of the last change is shown at the top.",
            ],
          },
        ],
      },
    },
  },
];
