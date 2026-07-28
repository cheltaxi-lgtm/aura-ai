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
  "Полный разбор этих карт — дальше, на сайте.",
  "Эти же карты ждут полного разбора на сайте.",
  "Чтобы увидеть разбор целиком — продолжение на сайте.",
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
    "/spread — расклад на три карты",
    "/again — ещё один расклад (если доступен сегодня)",
    "/day — карта дня",
    "/history — последние расклады",
    "/profile — профиль",
    "/settings — настройки",
    "/about — о салоне",
    "/delete — удалить данные",
    "/help — справка",
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
  teaserFooter: (uid: number, n: number) => pick(uid, n, TEASER_FOOTER),
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
  profile: (p: {
    since: string;
    streak: number;
    spreads: number;
    age: boolean;
    consent: boolean;
    refLink: string;
    invites: number;
    timezone: string;
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
    copy.teaserFooter(uid, 5),
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
