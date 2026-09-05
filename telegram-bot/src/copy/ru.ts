/** Salon copy — no emoji in message bodies. Variants rotate by (userId, counter). */

function pick(userId: number, counter: number, variants: readonly string[]): string {
  const i = Math.abs((userId * 31 + counter * 17) % variants.length);
  return variants[i]!;
}

const PAUSE = [
  "Секунду. Слушаю вопрос.",
  "Держу паузу — колода отвечает.",
  "Сейчас. Не торопим карты.",
] as const;

const SHUFFLE = [
  "Тасую колоду.",
  "Карты собираются под ваш вопрос.",
  "Колода в движении.",
] as const;

const DAY_PREP = [
  "Мешаю карты и вытягиваю карту дня.",
  "Секунду — собираю энергию дня.",
  "Колода отвечает на сегодняшний день.",
] as const;

const MATRIX_PREP = [
  "Секунду — открываю матрицу судьбы.",
  "Считаю схему. Это займёт немного времени.",
  "Собираю матрицу — подождите.",
] as const;

const CABINET_PREP = [
  "Секунду, открываю…",
  "Загружаю. Подождите немного.",
  "Сейчас пришлю.",
] as const;

const LIMIT = [
  "Сейчас нельзя начать новый расклад. Пополните руны или откройте кабинет — лимиты и баланс общие с сайтом.",
  "Расклад пока недоступен. Проверьте баланс рун в Профиле или на сайте.",
  "Не удалось открыть расклад. Загляните в Профиль → Руны или повторите чуть позже.",
] as const;

const LLM_QUIET = [
  "Ориентир сложился короче обычного — этого достаточно для первого шага.",
  "Сейчас дам сжатый контур. Полный разбор — отдельно.",
  "Краткий ответ готов. Глубже — в полном разборе.",
] as const;

const GATE = [
  "Сначала подтвердите возраст и согласие с условиями — это займёт минуту.",
  "Нужны два коротких шага: возраст и согласие. Затем откроем салон.",
  "Без подтверждения возраста и согласия расклад закрыт.",
] as const;

const CLOSED = [
  "Салон сейчас закрыт. Загляните чуть позже.",
  "Приём временно приостановлен. Скоро снова откроемся.",
  "Сегодня салон недоступен. Попробуйте позднее.",
] as const;

const ASK = [
  "О чём спросить карты? Выберите формулировку или напишите свою.",
  "Какой вопрос сейчас важнее? Можно выбрать ниже или сформулировать самим.",
  "С чего начнём? Готовый вопрос или ваш текст.",
] as const;

const OWN = [
  "Напишите вопрос одним сообщением — коротко и по сути.",
  "Ваш вопрос — одним текстом. Чем яснее формулировка, тем точнее контур.",
  "Опишите ситуацию коротко. Одного сообщения достаточно.",
] as const;

const TEASER_FOOTER = [
  "Привяжите аккаунт Zovus — история и эти же карты будут с вами на любом устройстве.",
  "Сохраните расклад в аккаунте Zovus: баланс, история и продолжение без потери карт.",
  "Чтобы не потерять эти карты — привяжите аккаунт Zovus. Можно с телефона или с компьютера.",
] as const;

const LINK_WELCOME = [
  "Аккаунт Zovus привязан. Эти карты и история теперь с вами — можно открыть салон на сайте, когда удобно.",
  "Готово: Telegram и Zovus связаны. Расклады из салона сохраняются в вашем аккаунте.",
  "Привязка состоялась. Дальше можно продолжать и здесь, и на сайте — карты те же.",
] as const;

const CRISIS = [
  "Сейчас важнее живая поддержка, а не карты. Обратитесь к близким или на телефон доверия: 8-800-2000-122. Я рядом в других вопросах, когда будет можно.",
  "В такой теме карты не помогают. Пожалуйста, свяжитесь с людьми, которым доверяете, или с службой поддержки 8-800-2000-122.",
  "Не буду раскрывать карты в этой ситуации. Если тяжело — поговорите с кем-то рядом или позвоните 8-800-2000-122.",
] as const;

export const copy = {
  about: [
    "Zovus — приватный цифровой салон.",
    "",
    "Карты, мастера и разборы — в одном аккаунте: здесь и на сайте.",
    "Салон помнит важное из ваших сессий и мягко учитывает это в следующих ответах — без необходимости всё пересказывать заново.",
    "",
    "Наставники — ИИ в художественном образе. Развлекательный сервис, 18+.",
  ].join("\n"),

  /** Caption under the home plate (no emoji — body copy rule). */
  homeHero: (name?: string | null) => {
    const who = (name || "").trim();
    return [
      who ? `${who}, рады видеть вас в Zovus.` : "Рады видеть вас в Zovus.",
      "",
      "Расклад и карта дня — в меню внизу. История и руны — в разделе «Профиль». Тот же аккаунт, что на zovus.ru.",
    ].join("\n");
  },

  help: [
    "Команды:",
    "/start — главная салона",
    "/menu — обновить меню",
    "/spread — каталог раскладов (как на сайте) и свой вопрос",
    "/again — ещё один расклад",
    "/day — энергия дня (как на сайте)",
    "/history — общая история Zovus",
    "/profile — профиль и привязка аккаунта",
    "/settings — настройки",
    "/about — о салоне",
    "/delete — удалить аккаунт Zovus целиком",
    "/help — справка",
    "",
    "Бот и сайт — один аккаунт: история, руны и память общие.",
  ].join("\n"),

  greeting: (name: string) =>
    [
      `${name}, добро пожаловать в Zovus.`,
      "",
      "Приватный цифровой салон: расклад под вопрос, карта дня и память сессий.",
      "Наставник — ИИ в художественном образе. Полный разбор — здесь и на сайте, с теми же картами.",
    ].join("\n"),

  ageAsk: "Сервис только для взрослых. Вам уже исполнилось 18 лет?",
  ageNo: "Тогда мы пока прощаемся. Возвращайтесь, когда будет можно.",
  consentAsk: (site: string) =>
    [
      "Чтобы продолжить, нужно согласие с условиями сервиса и обработкой персональных данных.",
      "",
      `Оферта: ${site}/offer`,
      `ПДн: ${site}/privacy`,
      `Условия: ${site}/terms`,
    ].join("\n"),

  gateBlocked: (uid: number, n: number) => pick(uid, n, GATE),
  botDisabled: (uid: number, n: number) => pick(uid, n, CLOSED),
  banned: "Доступ к боту ограничен.",

  menuTitle: "Меню закреплено внизу — выбирайте в любой момент.",
  salonReady: "Салон открыт. Меню всегда под рукой.",
  homePhotoFailed: "Салон открыт. Меню внизу — расклад, карта дня, матрица, история.",

  pause: (uid: number, n: number) => pick(uid, n, PAUSE),
  shuffling: (uid: number, n: number) => pick(uid, n, SHUFFLE),
  dayPreparing: (uid: number, n: number) => pick(uid, n, DAY_PREP),
  matrixPreparing: (uid: number, n: number) => pick(uid, n, MATRIX_PREP),
  cabinetPreparing: (uid: number, n: number) => pick(uid, n, CABINET_PREP),
  askQuestion: (uid: number, n: number) => pick(uid, n, ASK),
  ownQuestion: (uid: number, n: number) => pick(uid, n, OWN),
  limitReached: (uid: number, n: number) => pick(uid, n, LIMIT),
  spreadInProgress:
    "Расклад ещё собирается. Подождите минуту и откройте меню снова — или нажмите «Расклад», когда тизер уже пришёл.",
  ctaSendFailed:
    "Короткий ориентир уже у вас. Ссылка на аккаунт не отправилась — нажмите кнопку ниже, чтобы получить её снова.",
  ctaResendButton: "Получить ссылку снова",
  ctaExpired: "Срок ссылки на этот расклад истёк. Можно сделать новый расклад из меню.",
  continueOnSite: "Открыть на сайте",
  continueDiscussionOnSite: "Продолжить обсуждение на сайте",
  continueReading: "Продолжить разбор",
  weeklyDigest: (p: { streak: number; spreads: number }) =>
    [
      "Недельный ориентир из салона.",
      "",
      `Дней подряд: ${p.streak}.`,
      `Раскладов за неделю в боте: ${p.spreads}.`,
      "",
      "Если хотите — карта дня или новый вопрос ждут в меню.",
    ].join("\n"),
  teaserFooter: (uid: number, n: number) => pick(uid, n, TEASER_FOOTER),
  linkWelcome: (uid: number, n: number) => pick(uid, n, LINK_WELCOME),
  ctaLinkButton: "Привязать аккаунт Zovus",
  profileLinked: "Аккаунт Zovus: привязан",
  profileNotLinked: "Аккаунт Zovus: не привязан",
  profileLinkHint: "Привяжите аккаунт — история и баланс будут с вами на сайте и в боте.",
  profileLoginMethodsHint:
    "Чтобы зайти с компьютера без Telegram: нажмите «Вход с сайта» → Яндекс, VK или почта.",
  profileContinueHint: "Есть незавершённый расклад — продолжите на сайте по кнопке ниже.",
  needSiteAccount:
    "Не удалось открыть салон. Попробуйте ещё раз через минуту — или привяжите аккаунт на сайте по кнопке ниже.",
  needSiteOnboarding:
    "Осталось чуть-чуть: часовой пояс, город и дата рождения.",
  profileCityAsk:
    "Напишите город рождения — как в паспорте или привычно.\nНапример: Москва или Казань",
  profileCityShort: "Нужно хотя бы две буквы названия города.",
  profileCityEmpty:
    "Город не найден. Попробуйте другое написание — например: Санкт-Петербург",
  profileCityPick: "Выберите город из списка:",
  profileDobAsk:
    "Напишите дату рождения цифрами — день.месяц.год.\nНапример: 12.03.1990",
  profileDobInvalid: "Не разобрала дату. Формат: 12.03.1990",
  profileDobTooYoung: "Салон только для совершеннолетних.",
  profileGenderAsk: "Укажите пол — так салон точнее обращается в раскладах:",
  profileMemoryAsk: [
    "Персональная память",
    "",
    "Салон может помнить важное из сессий — следующие разборы продолжают вашу линию.",
    "Смотреть и очищать память можно в кабинете. Выбор всегда можно изменить.",
  ].join("\n"),
  profileReady: (runes: number) =>
    [
      "Салон готов — история и руны уже с вами.",
      runes > 0 ? `На старте: ${runes} ᚢ.` : null,
      "Можно делать расклад или пополнить баланс.",
    ]
      .filter(Boolean)
      .join("\n"),
  accountOpened: "Аккаунт Zovus открыт. Можно пользоваться салоном в боте.",
  siteBridgeDown: "Связь с сайтом временно недоступна. Попробуйте через минуту.",
  matrixStillWorking:
    "Разбор ещё собирается на сервере. Подождите минуту и откройте «Матрица» снова — готовый отчёт подтянется без повторной оплаты.",
  linkCodeIssued:
    "Откройте ссылку ниже, войдите на zovus.ru (email, Яндекс или VK) — Telegram привяжется к аккаунту. Код действует несколько минут.",
  authBridgeRetired:
    "Вход через Telegram на сайте больше недоступен. Ниже — ссылка для привязки уже существующего аккаунта.",
  authBridgeOk: "Готово.",
  authBridgeFail: "Не удалось выполнить действие. Запросите новую ссылку: /start link",
  insufficientRunes: "Недостаточно рун для полного разбора. Пополните баланс на сайте.",
  fullReadingDone: "Полный разбор сохранён в вашей истории Zovus — он же на сайте.",
  fullReadingAskMore: "Можно задать уточняющий вопрос по этому раскладу — как на сайте.",
  miniAppOpenHint: "Откройте салон",
  miniAppOpenBody:
    "Нажмите «Открыть салон» ниже — откроется одно окно кабинета.",
  runesBalance: (n: number) => `Баланс: ${n} ᚢ.`,
  /** Fallback when shop card render fails — no price-list spam. */
  runesShopIntro: (balance: number) =>
    [
      `Баланс: ${balance} ᚢ.`,
      "",
      "Выберите наполнение ниже — оплата картой через ЮKassa.",
    ].join("\n"),
  runesBuyOpening: "Открываю оплату…",
  runesPayLink: (name: string, totalRunes: number, priceRub: number) =>
    `«${name}» — ${totalRunes} ᚢ · ${Math.max(0, Math.round(priceRub))} ₽.\nНажмите кнопку — откроется безопасная оплата ЮKassa.`,
  runesCustomAsk: (minRub: number, maxRub: number, rubPerRune: number) =>
    [
      "Своя сумма",
      "",
      `Напишите сумму цифрами — от ${minRub} до ${maxRub} ₽.`,
      `Курс: ${rubPerRune} ₽ за 1 ᚢ.`,
    ].join("\n"),
  runesCustomInvalid: "Нужна сумма цифрами. Например: 500",
  runesCustomTooLow: (minRub: number) => `Минимум — ${minRub} ₽.`,
  runesCustomTooHigh: (maxRub: number) => `Максимум — ${maxRub} ₽.`,
  runesCredited: (added: number, name: string, balance: number, already: boolean) =>
    already
      ? `Эта оплата уже в балансе.\nСейчас у вас ${balance} ᚢ.`
      : `«${name}» — ${added} ᚢ на счету.\nБаланс: ${balance} ᚢ.`,
  catalogTitle: "Каталог раскладов Zovus — тот же, что на сайте.",
  catalogPick:
    "Выберите тему. В боте — короткий триплет Вероники (3 карты); полные схемы — на сайте.",
  catalogEmpty: "В этой теме пока нет раскладов.",
  catalogFailed: "Не удалось открыть каталог. Попробуйте через минуту.",
  catalogOnSite: "Открыть каталог на сайте",
  catalogRunHere: "Сделать в боте",
  catalogOpenSite: "Полный расклад на сайте",
  catalogOwnQuestion: "Свой вопрос",
  catalogBack: "← К каталогу",
  catalogFeatured: "Популярные",
  catalogAll: "Все расклады",
  natalEmpty: "Натальная карта ещё не построена. Заполните место и время рождения на сайте.",
  natalTitle: "Твоя натальная опора",
  hdTitle: "Твой Дизайн Человека",
  hdEmpty:
    "Карта Дизайна Человека ещё не рассчитана. Заполните дату, время и место рождения на сайте — бодиграф построится автоматически.",
  matrixTitle: "Матрица судьбы",
  matrixNeedsBirth: "Нужна дата рождения в профиле на сайте — тогда матрица откроется и здесь.",
  matrixReportsEmpty: "Сохранённых отчётов пока нет. Можно получить матрицу ниже.",
  matrixRunning: "Готовлю полный разбор матрицы…",
  matrixInsufficient: (need: number, bal: number) =>
    `Недостаточно рун для полного разбора: нужно ${need}, на балансе ${bal}. Пополните на сайте.`,
  ritualsEmpty: "Обрядов пока нет. Начать можно на сайте в кабинете.",
  jointEmpty: "Совместных раскладов пока нет. Создать — на сайте.",
  memoryEmpty: "Салон ещё ничего не запомнил о вас.",
  photoEmpty: "Архив фото-раскладов пока пуст — сделайте первый.",
  photoNativeHint: "Пришлите фото расклада — распознаем карты и дадим полный разбор.",
  photoTitle: "Расклад по фото",
  photoIntro: (cost: number, firstDiscount: boolean, balance: number | null) => {
    const bal = balance == null ? "" : ` Баланс: ${balance}ᚢ.`;
    const deal = firstDiscount ? " Первая расшифровка — со скидкой 50%." : "";
    return `Снимок готового расклада — мастер узнает карты и даст полный разбор. Расшифровка: ${cost}ᚢ.${deal}${bal}`;
  },
  photoListHint: "Архив ниже — листайте, как историю. Или начните новый.",
  photoAskPhoto: (cost: number) =>
    `Пришлите фото расклада (JPEG/PNG/WebP). Вопрос — в подписи к фото или отдельным сообщением до снимка.\n\nРаспознавание бесплатно. Расшифровка — ${cost}ᚢ.`,
  photoQuestionSaved: "Вопрос записала. Теперь пришлите фото расклада.",
  photoRecognizing: "Смотрю на фото…",
  photoRecognizedTitle: "Распознанный расклад",
  photoConfirmHint: "Сверьте карты на коллаже. Если всё верно — «Расшифровать». Поправить названия можно на сайте.",
  photoConfirmPrompt: "Подтвердите расклад — и откроем полный разбор.",
  photoInterpreting: (cost: number) => `Готовлю расшифровку (${cost}ᚢ)…`,
  photoInsufficient: (need: number, bal: number) =>
    `Недостаточно рун для фото-расклада: нужно ${need}, на балансе ${bal}. Пополните на сайте.`,
  photoInterpretFail: "Не удалось показать трактовку. Номер запроса сохранён. Откройте /resume или Профиль → Восстановить запрос: повторная загрузка фотографии не нужна.",
  photoNotSpread: "На фото не удалось увидеть расклад. Попробуйте другое фото или загрузите на сайте.",
  photoTooLarge: "Фото слишком тяжёлое. Пришлите снимок поменьше (до 5 МБ).",
  photoDownloadFail: "Не удалось скачать фото из Telegram. Пришлите ещё раз.",
  photoNotFound: "Этот фото-расклад не найден.",
  photoStartOver: "Начните новый расклад по фото из меню.",
  photoCancelled: "Фото-расклад отменён.",
  photoSavedHint: "Разбор сохранён в кабинете. Вопросы по нему — на сайте.",
  supportTitle: "Поддержка Zovus",
  supportEmpty: "Обращений пока нет. Опишите вопрос — он сохранится в поддержке, а ответ придёт сюда и в кабинет.",
  supportAskMessage: "Опишите вопрос одним сообщением — создадим обращение в поддержке. Оно сразу попадёт в кабинет на сайте.",
  supportAskReply: "Напишите ответ в обращение. Чтобы отменить — «Закончить диалог».",
  supportCreated: "Обращение принято. Ответ придёт сюда и в кабинет на сайте.",
  supportAdminReply: (subject: string, preview: string) => {
    const sub = (subject || "обращение").trim().slice(0, 120);
    const body = (preview || "").trim().slice(0, 700);
    return [
      "Ответ поддержки Zovus",
      "",
      `Тема: ${sub}`,
      ...(body ? ["", body] : []),
      "",
      "Можете ответить кнопкой ниже — сообщение уйдёт в то же обращение.",
    ].join("\n");
  },
  reportReady: (title: string) => {
    const t = (title || "Отчёт готов").trim().slice(0, 160);
    return [
      t,
      "",
      "Разбор сохранён в вашем кабинете — откройте по кнопке ниже.",
      "Повторного списания рун не будет.",
    ].join("\n");
  },
  reportReadyOpen: "Открыть отчёт",
  reminder: (title: string, body: string) => {
    const t = (title || "Напоминание Zovus").trim().slice(0, 160);
    const b = (body || "").trim().slice(0, 400);
    return b ? [t, "", b].join("\n") : t;
  },
  reminderOpen: "Открыть",
  reminderDisable: "Отключить напоминание",
  chatAskPrompt: "Напишите вопрос по этому раскладу. Чтобы выйти — кнопка «Закончить диалог».",
  chatStopped: "Диалог по раскладу закрыт. Можно открыть новый из истории или меню.",
  chatThinking: "Смотрю в карты…",
  cabinetOverviewTitle: "Кабинет Zovus",

  llmQuiet: (uid: number, n: number) => pick(uid, n, LLM_QUIET),
  crisis: (uid: number, n: number) => pick(uid, n, CRISIS),

  rateSlow: "Слишком быстро. Подождите минуту — и продолжим спокойно.",
  dayDisabled: "Карта дня сейчас недоступна.",
  dayAlready: "Карта дня уже открыта сегодня. Завтра будет новая.",
  settingsTitle: "Настройки",
  settingsHint: "Напоминания, голос и время. Выберите ниже.",
  stopOk: "Напоминания выключены.",
  voiceText: "Режим ответа: только текст.",
  voiceBoth: "Режим ответа: текст и голос.",
  timezoneAsk: "В каком часовом поясе вы обычно здесь? Выберите ближайший.",
  timezoneAskSoft:
    "Чтобы напоминания приходили вовремя — выберите часовой пояс. Можно пропустить: останется Москва (UTC+3). Сменить позже: Профиль → Настройки.",
  timezoneAskReminders:
    "Перед включением напоминаний выберите часовой пояс — иначе время может не совпасть с вашим днём.",
  timezoneSet: "Время сохранено. Напоминания будут по вашему локальному часу.",
  timezoneSkipped: "Оставили Москву (UTC+3). Сменить можно в Профиле → Настройки.",
  unsubscribeOk: "Хорошо. Больше не побеспокоим. Если передумаете — Профиль → Настройки.",
  shareHint: "Можно переслать изображение или пригласить в салон по ссылке из профиля.",
  shareDisabled: "Сейчас поделиться раскладом из салона нельзя.",
  spreadFailed:
    "Расклад не состоялся. Можно попробовать снова с тем же вопросом — салон вас ждёт.",
  spreadSavedOnSite:
    "Расклад готов и сохранён в вашей истории. Откройте «История» в меню — он уже там.",
  profile: (p: {
    since: string;
    streak: number;
    spreads: number;
    age: boolean;
    consent: boolean;
    refLink: string;
    invites: number;
    timezone: string;
    zovusLinked: boolean;
  }) =>
    [
      "Профиль",
      "",
      `Первый визит: ${p.since}`,
      `Дней подряд: ${p.streak}`,
      `Раскладов: ${p.spreads}`,
      `Часовой пояс: ${p.timezone}`,
      `18+: ${p.age ? "да" : "нет"}`,
      `Согласия: ${p.consent ? "приняты" : "нет"}`,
      `Приглашено: ${p.invites}`,
      p.zovusLinked ? "Аккаунт Zovus: привязан" : "Аккаунт Zovus: не привязан",
      ...(p.zovusLinked
        ? []
        : ["", "Привяжите аккаунт — история и баланс будут с вами на сайте и в боте."]),
      "",
      `Ваша ссылка: ${p.refLink}`,
      "",
      "Сменить пояс: Профиль → Настройки → Часовой пояс.",
    ].join("\n"),

  historyEmpty: "Пока нет сохранённых раскладов.",
  historyTitle: "История раскладов Zovus",
  deleteAsk: [
    "Удалить аккаунт Zovus целиком?",
    "",
    "Будут стёрты: профиль, история, расклады, руны, память и привязка Telegram — и в боте, и на сайте.",
    "Это действие нельзя отменить.",
  ].join("\n"),
  deleteConfirm: [
    "Подтвердите ещё раз: удалить аккаунт Zovus безвозвратно?",
    "После этого понадобится новый /start, если захотите вернуться.",
  ].join("\n"),
  deleteDone:
    "Аккаунт Zovus удалён. Данные стёрты. Если захотите — начните с /start.",
  deleteSiteFailed:
    "Не удалось удалить аккаунт на сайте. Попробуйте позже или удалите в кабинете на zovus.ru. Данные в боте не трогали.",
  deleteLocalOnly:
    "Аккаунт на сайте не найден. Очистили данные только в боте. Если аккаунт есть на сайте — удалите его в кабинете.",
  abandoned:
    "Вы оставили вопрос без расклада. Если хотите — завершите его из меню, пока мысль свежа.",
  reminderMorning: "Доброе утро. Если нужно — откройте карту дня.",
  reminderEvening: "Вечер — хорошее время для одной тихой карты. Откройте карту дня, если хотите.",
  milestone: (days: number) =>
    `Вы рядом уже ${days} ${days === 1 ? "день" : days < 5 ? "дня" : "дней"}. Спокойно продолжаем.`,
  reactivation: (days: number) =>
    [
      `Давно не виделись — около ${days} дней.`,
      "Если хотите, карта дня или новый расклад ждут в меню.",
      "Если не нужно — скажите, больше не побеспокоим.",
    ].join("\n"),
  navHint: "Чтобы сделать расклад — нажмите «Расклад» внизу.",
  medical:
    "Медицинские и юридические темы здесь не разбираем. Сформулируйте вопрос про чувства или выбор — без диагнозов и приговоров.",
  thirdParty:
    "Мы не гадаем о несовершеннолетних и не берём чужие жизни без согласия. Спросите о себе и своей ситуации.",
  cardLine: (pos: string, name: string, reversed: boolean) =>
    `${pos}: ${name}${reversed ? ", перевёрнута" : ""}`,
} as const;

/** Test helper: body strings must not contain emoji pictographs. */
export function collectBodyCopySamples(): string[] {
  const uid = 1;
  return [
    copy.about,
    copy.help,
    copy.greeting("Анна"),
    copy.ageAsk,
    copy.ageNo,
    copy.consentAsk("https://zovus.ru"),
    copy.gateBlocked(uid, 0),
    copy.botDisabled(uid, 1),
    copy.banned,
    copy.menuTitle,
    copy.salonReady,
    copy.homeHero("Анна"),
    copy.homeHero(null),
    copy.homePhotoFailed,
    copy.pause(uid, 0),
    copy.shuffling(uid, 1),
    copy.askQuestion(uid, 2),
    copy.ownQuestion(uid, 3),
    copy.limitReached(uid, 4),
    copy.spreadInProgress,
    copy.spreadSavedOnSite,
    copy.ctaSendFailed,
    copy.ctaExpired,
    copy.continueOnSite,
    copy.continueReading,
    copy.weeklyDigest({ streak: 3, spreads: 2 }),
    copy.teaserFooter(uid, 5),
    copy.linkWelcome(uid, 0),
    copy.profileLinked,
    copy.profileNotLinked,
    copy.profileLinkHint,
    copy.profileLoginMethodsHint,
    copy.profileContinueHint,
    copy.needSiteAccount,
    copy.needSiteOnboarding,
    copy.profileCityAsk,
    copy.profileCityShort,
    copy.profileCityEmpty,
    copy.profileCityPick,
    copy.profileDobAsk,
    copy.profileDobInvalid,
    copy.profileDobTooYoung,
    copy.profileGenderAsk,
    copy.profileMemoryAsk,
    copy.profileReady(30),
    copy.accountOpened,
    copy.siteBridgeDown,
    copy.linkCodeIssued,
    copy.authBridgeRetired,
    copy.authBridgeOk,
    copy.authBridgeFail,
    copy.insufficientRunes,
    copy.fullReadingDone,
    copy.runesBalance(12),
    copy.natalEmpty,
    copy.natalTitle,
    copy.hdTitle,
    copy.hdEmpty,
    copy.matrixTitle,
    copy.matrixNeedsBirth,
    copy.matrixReportsEmpty,
    copy.matrixRunning,
    copy.matrixInsufficient(20, 5),
    copy.ritualsEmpty,
    copy.jointEmpty,
    copy.memoryEmpty,
    copy.photoEmpty,
    copy.photoNativeHint,
    copy.photoTitle,
    copy.photoIntro(30, true, 100),
    copy.photoListHint,
    copy.photoAskPhoto(30),
    copy.photoQuestionSaved,
    copy.photoRecognizing,
    copy.photoRecognizedTitle,
    copy.photoConfirmHint,
    copy.photoConfirmPrompt,
    copy.photoInterpreting(30),
    copy.photoInsufficient(30, 5),
    copy.photoInterpretFail,
    copy.photoNotSpread,
    copy.photoTooLarge,
    copy.photoDownloadFail,
    copy.photoNotFound,
    copy.photoStartOver,
    copy.photoCancelled,
    copy.photoSavedHint,
    copy.supportTitle,
    copy.supportEmpty,
    copy.supportAskMessage,
    copy.supportAskReply,
    copy.supportCreated,
    copy.supportAdminReply("Тема", "Текст ответа"),
    copy.reportReady("Натальный разбор готов"),
    copy.reportReadyOpen,
    copy.reminder("Карты дня ждут вас", "Бесплатный расклад на сутки готов."),
    copy.reminderOpen,
    copy.reminderDisable,
    copy.chatAskPrompt,
    copy.chatStopped,
    copy.chatThinking,
    copy.cabinetOverviewTitle,
    copy.fullReadingAskMore,
    copy.llmQuiet(uid, 6),
    copy.crisis(uid, 7),
    copy.rateSlow,
    copy.dayDisabled,
    copy.dayAlready,
    copy.settingsTitle,
    copy.settingsHint,
    copy.timezoneAsk,
    copy.timezoneAskSoft,
    copy.timezoneAskReminders,
    copy.timezoneSet,
    copy.timezoneSkipped,
    copy.stopOk,
    copy.historyEmpty,
    copy.deleteAsk,
    copy.deleteConfirm,
    copy.deleteDone,
    copy.deleteSiteFailed,
    copy.deleteLocalOnly,
    copy.abandoned,
    copy.reminderMorning,
    copy.reminderEvening,
    copy.medical,
    copy.thirdParty,
    copy.navHint,
  ];
}
