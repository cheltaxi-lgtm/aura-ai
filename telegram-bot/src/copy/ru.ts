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

const LIMIT = [
  "На сегодня расклад уже был. Один в день — чтобы не размывать внимание. Завтра открою новый.",
  "Лимит дня исчерпан. Завтра снова можно спросить карты.",
  "Сегодняшний расклад уже с вами. Новый — завтра.",
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
  "О чём спросить карты. Выберите формулировку или напишите свою.",
  "Какой вопрос сейчас важнее. Можно выбрать ниже или сформулировать самим.",
  "С чего начнём. Готовый вопрос или ваш текст.",
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
    "Наставник Вероника — ИИ в художественном образе. Карты выпадают на сервере; короткий ориентир не заменяет полный разбор.",
    "",
    "Развлекательный сервис, 18+.",
  ].join("\n"),

  help: [
    "Команды:",
    "/start — начать",
    "/menu — обновить меню",
    "/spread — полный расклад Вероники (общий с сайтом)",
    "/again — ещё один расклад",
    "/day — энергия дня (как на сайте)",
    "/history — общая история Zovus",
    "/profile — профиль и привязка аккаунта",
    "/settings — настройки",
    "/about — о салоне",
    "/delete — удалить данные бота",
    "/help — справка",
    "",
    "Бот и сайт — один аккаунт: история и руны общие.",
  ].join("\n"),

  greeting: (name: string) =>
    [
      `${name}, добро пожаловать в Zovus.`,
      "",
      "Приватный цифровой салон: три карты под ваш вопрос и короткий ориентир от Вероники.",
      "Наставник — ИИ в художественном образе. Полный разбор — на сайте, с теми же картами.",
    ].join("\n"),

  ageAsk: "Сервис только для взрослых. Вам уже исполнилось 18 лет.",
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

  pause: (uid: number, n: number) => pick(uid, n, PAUSE),
  shuffling: (uid: number, n: number) => pick(uid, n, SHUFFLE),
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
  profileContinueHint: "Есть незавершённый расклад — продолжите на сайте по кнопке ниже.",
  needSiteAccount:
    "Бот и сайт — один аккаунт Zovus. Привяжите Telegram на сайте, чтобы расклады, история и руны были общими.",
  needSiteOnboarding:
    "Аккаунт привязан. Завершите профиль на сайте (дата рождения) — затем расклад откроется и здесь.",
  siteBridgeDown: "Связь с сайтом временно недоступна. Попробуйте через минуту.",
  insufficientRunes: "Недостаточно рун для полного разбора. Пополните баланс на сайте.",
  fullReadingDone: "Полный разбор сохранён в вашей истории Zovus — он же на сайте.",
  fullReadingAskMore: "Можно задать уточняющий вопрос по этому раскладу — как на сайте.",
  runesBalance: (n: number) => `Баланс: ${n} рун.`,
  modulesTitle: "Разделы Zovus — в боте и на сайте:",
  modulesPick: "Выберите раздел. Часть ответов сразу здесь, полный кабинет — на сайте.",
  natalEmpty: "Натальная карта ещё не построена. Заполните место и время рождения на сайте.",
  natalTitle: "Ваша натальная опора",
  matrixTitle: "Свободная матрица судьбы",
  matrixNeedsBirth: "Нужна дата рождения в профиле на сайте — тогда матрица откроется и здесь.",
  ritualsEmpty: "Обрядов пока нет. Начать можно на сайте в кабинете.",
  jointEmpty: "Совместных раскладов пока нет. Создать — на сайте.",
  diaryEmpty: "В дневнике пока пусто.",
  memoryEmpty: "Салон ещё ничего не запомнил о вас.",
  photoEmpty: "Фото-раскладов пока нет. Загрузить фото можно на сайте.",
  photoNativeHint: "Список фото-раскладов ниже. Новый разбор по фото — на сайте (нужна загрузка).",
  supportTitle: "Поддержка Zovus",
  supportEmpty: "Обращений пока нет. Напишите — ответим в рабочее время.",
  supportAskMessage: "Опишите вопрос одним сообщением — создадим обращение в поддержке.",
  supportAskReply: "Напишите ответ в обращение. Чтобы отменить — «Закончить диалог».",
  supportCreated: "Обращение принято.",
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
  timezoneAsk: "В каком часовом поясе вы обычно здесь. Выберите ближайший.",
  timezoneAskSoft:
    "Чтобы напоминания приходили в удобное время — выберите часовой пояс. Можно пропустить: останется Москва.",
  timezoneAskReminders:
    "Перед включением напоминаний выберите часовой пояс — иначе время может не совпасть с вашим днём.",
  timezoneSet: "Время сохранено. Напоминания будут по вашему локальному часу.",
  timezoneSkipped: "Оставили Москву (UTC+3). Сменить можно в Настройках.",
  unsubscribeOk: "Хорошо. Больше не побеспокоим. Если передумаете — /settings.",
  shareHint: "Можно переслать изображение или пригласить в салон по ссылке из профиля.",
  shareDisabled: "Сейчас поделиться раскладом из салона нельзя.",
  spreadFailed:
    "Расклад не состоялся. Можно попробовать снова с тем же вопросом — салон вас ждёт.",
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
      "Сменить пояс: Настройки → Часовой пояс.",
    ].join("\n"),

  historyEmpty: "Пока нет сохранённых раскладов.",
  deleteAsk: "Удалить все ваши данные в боте. Это действие нельзя отменить.",
  deleteConfirm: "Подтвердите удаление ещё раз.",
  deleteDone: "Данные удалены. Если захотите — начните с /start.",
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
    copy.pause(uid, 0),
    copy.shuffling(uid, 1),
    copy.askQuestion(uid, 2),
    copy.ownQuestion(uid, 3),
    copy.limitReached(uid, 4),
    copy.spreadInProgress,
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
    copy.profileContinueHint,
    copy.needSiteAccount,
    copy.needSiteOnboarding,
    copy.siteBridgeDown,
    copy.insufficientRunes,
    copy.fullReadingDone,
    copy.runesBalance(12),
    copy.modulesTitle,
    copy.modulesPick,
    copy.natalEmpty,
    copy.natalTitle,
    copy.matrixTitle,
    copy.matrixNeedsBirth,
    copy.ritualsEmpty,
    copy.jointEmpty,
    copy.diaryEmpty,
    copy.memoryEmpty,
    copy.photoEmpty,
    copy.photoNativeHint,
    copy.supportTitle,
    copy.supportEmpty,
    copy.supportAskMessage,
    copy.supportAskReply,
    copy.supportCreated,
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
    copy.abandoned,
    copy.reminderMorning,
    copy.reminderEvening,
    copy.medical,
    copy.thirdParty,
    copy.navHint,
  ];
}
