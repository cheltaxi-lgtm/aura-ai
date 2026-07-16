import type { SpreadId } from "@/lib/spreads";
import type { SpreadIntentCategory } from "./types";

const S5 = ["Ситуация", "Препятствие", "Корень", "Совет", "Итог"] as const;
const LOVE5 = ["Его мысли", "Его чувства", "Что скрыто", "Что мешает", "Итог"] as const;
const TRIPLET = ["Прошлое", "Настоящее", "Будущее"] as const;
const LOVE7 = [
  "Вы",
  "Партнёр",
  "Связь",
  "Сила пары",
  "Слабое место",
  "Совет",
  "Итог",
] as const;

type BulkSeed = {
  slug: string;
  title: string;
  category: SpreadIntentCategory;
  question: string;
  intro: string;
  spreadId?: SpreadId;
  master?: string;
  positions?: readonly string[];
  related?: string[];
  featured?: boolean;
  requiresPartnerInfo?: boolean;
};

function love(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "love",
    question,
    intro,
    spreadId: "situation-5",
    positions: LOVE5,
    master: "veronika",
    ...extra,
  };
}

function career(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "career",
    question,
    intro,
    spreadId: "situation-5",
    positions: S5,
    master: "veronika",
    ...extra,
  };
}

function money(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "money",
    question,
    intro,
    spreadId: "situation-5",
    positions: S5,
    master: "ragnar",
    ...extra,
  };
}

function future(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "future",
    question,
    intro,
    spreadId: "triplet",
    positions: TRIPLET,
    master: "veronika",
    ...extra,
  };
}

function self(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "self",
    question,
    intro,
    spreadId: "situation-5",
    positions: S5,
    master: "agafya",
    ...extra,
  };
}

function choice(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "choice",
    question,
    intro,
    spreadId: "situation-5",
    positions: S5,
    ...extra,
  };
}

function family(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "family",
    question,
    intro,
    spreadId: "situation-5",
    positions: S5,
    master: "agafya",
    ...extra,
  };
}

function ritual(slug: string, title: string, question: string, intro: string, extra?: Partial<BulkSeed>): BulkSeed {
  return {
    slug,
    title,
    category: "ritual",
    question,
    intro,
    spreadId: "situation-5",
    positions: S5,
    master: "agafya",
    ...extra,
  };
}

/** Extended catalog (~95 intents) merged into SPREAD_INTENT_REGISTRY. */
export const BULK_INTENT_SEEDS: BulkSeed[] = [
  // Love (25)
  love("est-li-izmena", "Есть ли измена", "Есть ли у партнёра другой человек?", "Срез доверия и верности — спокойно, без роли детектива."),
  love("pochemu-on-ohlade", "Почему он остыл", "Почему он стал холодным ко мне?", "Что изменилось в чувствах и что можно вернуть."),
  love("kto-moya-sudba", "Кто моя судьба", "Кто мой человек по судьбе?", "Образ партнёра, встреча и знаки на пути."),
  love("kak-vernut-lyubov", "Как вернуть любовь", "Как вернуть чувства в отношениях?", "Что ослабило связь и что поможет снова сблизиться."),
  love("pochemu-net-otnosheniy", "Почему нет отношений", "Почему у меня не складываются отношения?", "Внутренние блоки и внешние обстоятельства."),
  love("chto-on-skryvaet-ot-menya", "Что он скрывает", "Что он скрывает от меня?", "Тайные мысли, страхи и намерения партнёра."),
  love("budet-li-svadba", "Будет ли свадьба", "Будем ли мы когда-нибудь жениться?", "Перспектива брака и готовность каждого."),
  love("kak-nayti-lyubov", "Как найти любовь", "Как мне встретить своего человека?", "Где искать, что изменить и когда ждать встречу."),
  love("pochemu-revnuyu", "Почему я ревную", "Откуда моя ревность и что с этим делать?", "Корень тревоги и путь к доверию."),
  love("on-svoboden", "Свободен ли он", "Свободен ли он для отношений со мной?", "Его статус, чувства и реальная готовность."),
  love("chto-meshaet-otnosheniyam", "Что мешает отношениям", "Что мешает нам быть вместе?", "Внешние и внутренние препятствия пары."),
  love("kak-priletet-vnimanie", "Как привлечь внимание", "Как привлечь его внимание?", "Что усилит интерес и как действовать."),
  love("pochemu-ignoriruet", "Почему игнорирует", "Почему он меня игнорирует?", "Причины дистанции и шанс на контакт."),
  love("est-li-budushchee-u-pary", "Есть ли будущее у пары", "Есть ли у нас будущее?", "Перспектива союза и ключевые точки."),
  love("karmicheskaya-svyaz", "Кармическая связь", "Кармическая ли это связь?", "Урок пары, долг и смысл встречи."),
  love("pochemu-revnuet", "Почему он ревнует", "Почему он ревнует меня?", "Его страхи, триггеры и что успокоит."),
  love("kak-naladit-otnosheniya", "Как наладить отношения", "Как наладить отношения с партнёром?", "Шаги к примирению и доверию."),
  love("chto-chuvstvuet-ona", "Что она чувствует", "Что она чувствует ко мне?", "Её мысли, чувства и скрытые мотивы.", { master: "veronika" }),
  love("vernetsya-li-ona", "Вернётся ли она", "Вернётся ли она после расставания?", "Движется ли она навстречу и итог паузы."),
  love("budet-li-pervoe-svidanie", "Будет ли первое свидание", "Состоится ли наше первое свидание?", "Его намерения и ближайшие шаги."),
  love("kak-priznat-sya-v-lyubvi", "Как признаться в любви", "Стоит ли признаться в чувствах и как?", "Риск, момент и вероятный ответ."),
  love("pochemu-boyus-otnosheniy", "Почему боюсь отношений", "Почему я боюсь близости?", "Страхи, прошлый опыт и путь к открытости.", { spreadId: "situation-5", positions: S5 }),
  love("sovmestim-li-my", "Совместимы ли мы", "Насколько мы совместимы?", "Сильные стороны пары и зоны трения.", {
    spreadId: "love-7",
    positions: LOVE7,
    requiresPartnerInfo: true,
  }),
  love("chto-on-delaet-nochyu", "О чём он думает ночью", "О чём он думает обо мне по ночам?", "Скрытые переживания и желания."),
  love("pochemu-net-blizosti", "Почему нет близости", "Почему между нами нет близости?", "Эмоциональные и физические барьеры."),

  // Career (18)
  career("stoit-li-menyat-sferu", "Стоит ли менять сферу", "Стоит ли мне менять профессиональную сферу?", "Риски смены направления и перспектива."),
  career("kak-proyti-sobesedovanie", "Как пройти собеседование", "Как пройти предстоящее собеседование?", "Что усилит шансы и на что обратить внимание."),
  career("pochemu-net-povysheniya", "Почему нет повышения", "Почему меня не повышают?", "Блоки, конкуренция и ваши сильные стороны."),
  career("stoit-li-otkryt-biznes", "Стоит ли открыть бизнес", "Стоит ли мне открывать своё дело?", "Ресурсы, риски и благоприятный момент."),
  career("kak-nayti-rabotu", "Как найти работу", "Как мне найти подходящую работу?", "Направление поиска и ключевой совет."),
  career("konflikt-s-nachalstvom", "Конфликт с начальством", "Как решить конфликт с начальником?", "Причины напряжения и выход."),
  career("stoit-li-pereezhat-radi-raboty", "Переезд ради работы", "Стоит ли переезжать ради новой работы?", "Плюсы, минусы и итог решения."),
  career("kuda-dvizhetsya-karera", "Куда движется карьера", "Куда движется моя карьера?", "Тренд, возможности и риски."),
  career("pochemu-vygoranie", "Почему выгорание", "Почему я выгораю на работе?", "Источник усталости и восстановление."),
  career("kto-moy-soyuznik-na-rabote", "Союзник на работе", "Кто мой союзник на работе?", "Поддержка, интриги и тактика."),
  career("stoit-li-prosit-povyshenie", "Просить повышение", "Стоит ли просить повышение зарплаты?", "Момент, аргументы и реакция."),
  career("pochemu-uvolili", "Почему уволили", "Почему меня уволили — урок и дальше?", "Смысл события и новый путь."),
  career("kakaya-professiya-podhodit", "Какая профессия подходит", "Какая профессия мне подходит?", "Сильные стороны и направление роста."),
  career("stoit-li-idti-v-frilans", "Стоит ли во фриланс", "Стоит ли уходить во фриланс?", "Свобода, риски и доход."),
  career("kak-naladit-komandu", "Как наладить команду", "Как улучшить работу в команде?", "Динамика коллектива и ваш вклад."),
  career("budet-li-proekt-uspehen", "Будет ли проект успешен", "Будет ли успешен мой проект?", "Сильные и слабые стороны задумки."),
  career("pochemu-net-motivacii", "Почему нет мотивации", "Почему пропала мотивация на работе?", "Источник спада и как вернуть драйв."),
  career("kak-vybrat-napravlenie", "Как выбрать направление", "Какое направление карьеры выбрать?", "Сравнение путей и совет карт."),

  // Money (15)
  money("kak-vybratsya-iz-dolgov", "Как выбраться из долгов", "Как мне выбраться из долгов?", "Стратегия, блоки и первый шаг."),
  money("kogda-pridut-dengi", "Когда придут деньги", "Когда ко мне придут деньги?", "Сроки, условия и что ускорит поток."),
  money("stoit-li-investirovat", "Стоит ли инвестировать", "Стоит ли мне инвестировать сейчас?", "Риск, перспектива и совет."),
  money("pochemu-net-dohoda", "Почему нет дохода", "Почему у меня нет стабильного дохода?", "Блоки и точки роста."),
  money("kak-privlech-klientov", "Как привлечь клиентов", "Как привлечь больше клиентов?", "Что работает и что мешает."),
  money("denezhnyy-potok", "Денежный поток", "Как улучшить денежный поток?", "Откуда приходит и куда утекает."),
  money("stoit-li-pokupat-nedvizhimost", "Покупка недвижимости", "Стоит ли покупать недвижимость сейчас?", "Выгода, риски и момент."),
  money("kak-uvelichit-prodazhi", "Как увеличить продажи", "Как увеличить продажи?", "Точки роста и препятствия."),
  money("pochemu-traty-bolshe-dohoda", "Траты больше дохода", "Почему траты превышают доход?", "Причины и как выровнять баланс."),
  money("kak-nakopit", "Как накопить", "Как мне начать копить деньги?", "Привычки, блоки и первый шаг."),
  money("stoit-li-doverit-finansy", "Доверить финансы", "Стоит ли доверить финансы партнёру?", "Риски, выгода и честный взгляд."),
  money("kakaya-finansovaya-cel", "Финансовая цель", "Какая финансовая цель мне сейчас важнее?", "Приоритет и план."),
  money("pochemu-boyus-deneg", "Почему боюсь денег", "Почему я боюсь больших денег?", "Установки и путь к изобилию."),
  money("kak-poluchit-premiyu", "Как получить премию", "Получу ли я премию или бонус?", "Шансы и что усилит результат."),
  money("stoit-li-smenit-bank", "Сменить банк или вклад", "Стоит ли менять банк или вклад?", "Выгода, риски и момент."),

  // Future (12)
  future("chto-zhdet-zavtra", "Что ждёт завтра", "Что меня ждёт завтра?", "Краткий прогноз на ближайший день."),
  future("prognoz-na-nedelyu", "Прогноз на неделю", "Что ждёт меня на этой неделе?", "Ключевые события и совет.", {
    spreadId: "week-overview",
    positions: [
      "Начало недели",
      "Работа и дела",
      "Отношения",
      "Энергия",
      "Поворот недели",
      "Совет",
      "Итог недели",
    ],
  }),
  future("prognoz-na-mesyac", "Прогноз на месяц", "Как пройдёт ближайший месяц?", "Тенденции и важные точки."),
  future("chto-izmenitsya-k-oseni", "Что изменится к осени", "Что изменится в моей жизни к осени?", "Повороты и возможности."),
  future("kakoy-god-budet", "Какой будет год", "Каким будет для меня этот год?", "Главные темы и уроки года."),
  future("chto-neset-vesna", "Что несёт весна", "Что принесёт мне весна?", "Обновление, шансы и предостережения."),
  future("kak-slozhitsya-leto", "Как сложится лето", "Как сложится для меня лето?", "Отдых, отношения и дела."),
  future("chto-zhdet-zimoy", "Что ждёт зимой", "Что ждёт меня зимой?", "Период паузы, итогов и подготовки."),
  future("kakoy-povorot-blizko", "Какой поворот близко", "Какой поворот судьбы близко?", "Событие, которое меняет траекторию."),
  future("chto-otkroetsya-v-skoro", "Что откроется скоро", "Что скоро откроется для меня?", "Новые двери и условия."),
  future("kak-slozhitsya-puteshestvie", "Как сложится путешествие", "Как сложится моё путешествие?", "Поездка, впечатления и знаки."),
  future("chto-prineset-polnolunie", "Что принесёт полнолуние", "Что принесёт ближайшее полнолуние?", "Пик энергии и возможности."),

  // Self (12)
  self("kakaya-moya-missiya", "Какая моя миссия", "В чём моя жизненная миссия?", "Призвание и направление души."),
  self("chto-menya-ogranichivaet", "Что меня ограничивает", "Что меня сильнее всего ограничивает?", "Внутренние барьеры и выход."),
  self("kak-raskryt-potencial", "Как раскрыть потенциал", "Как раскрыть свой потенциал?", "Сильные стороны и следующий шаг."),
  self("pochemu-net-uverennosti", "Почему нет уверенности", "Почему у меня мало уверенности?", "Корень сомнений и опора."),
  self("kak-nayti-sebya", "Как найти себя", "Как мне найти себя?", "Путь самопознания и ключевой совет."),
  self("chto-blokiruet-schaste", "Что блокирует счастье", "Что блокирует моё счастье?", "Скрытые причины и освобождение."),
  self("kakaya-moya-sila", "Какая моя сила", "В чём моя главная сила?", "Талант, который стоит использовать."),
  self("pochemu-trevoga", "Почему тревога", "Откуда моя постоянная тревога?", "Источник тревоги и успокоение."),
  self("kak-obresti-balans", "Как обрести баланс", "Как обрести баланс в жизни?", "Где перекос и как выровнять."),
  self("chto-uchit-dusha", "Что учит душа", "Какой урок сейчас проходит моя душа?", "Смысл периода и интеграция."),
  self("kak-probuditsya", "Как пробудиться", "Как мне духовно пробудиться?", "Этап пути и практический совет."),
  self("kakaya-emociya-podavlena", "Какая эмоция подавлена", "Какую эмоцию я подавляю?", "Что просится наружу и зачем."),

  // Choice (10)
  choice("dva-puti-vybor", "Выбор между двумя путями", "Какой из двух путей мне выбрать?", "Сравнение вариантов и последствия."),
  choice("stoit-li-risknut", "Стоит ли рискнуть", "Стоит ли мне рискнуть сейчас?", "Риск, награда и совет карт."),
  choice("kuda-pereehat", "Куда переехать", "Стоит ли переезжать и куда?", "Направление, плюсы и минусы."),
  choice("kakoe-reshenie-pravilnoe", "Какое решение правильное", "Какое решение для меня правильное?", "Ясность при развилке."),
  choice("stoit-li-prostit", "Стоит ли простить", "Стоит ли мне простить этого человека?", "Цена прощения и ваш покой."),
  choice("kak-postupit-s-segodnya", "Как поступить сегодня", "Как мне лучше поступить сегодня?", "Совет на ближайшие часы."),
  choice("stoit-li-skazat-pravdu", "Стоит ли сказать правду", "Стоит ли сказать правду?", "Последствия честности и момент."),
  choice("kakoy-variant-luchshe", "Какой вариант лучше", "Какой вариант для меня лучше?", "Сравнение и итог."),
  choice("stoit-li-zakonchit-proekt", "Закончить проект", "Стоит ли доводить этот проект до конца?", "Перспектива и цена продолжения."),
  choice("kakoe-reshenie-zhdet", "Какое решение ждёт", "Какое решение от меня ждут обстоятельства?", "Подсказка судьбы на развилке."),

  // Family (8)
  family("kak-naladit-otnosheniya-s-mamoy", "Отношения с мамой", "Как наладить отношения с мамой?", "Корень конфликта и путь к примирению."),
  family("kak-naladit-otnosheniya-s-papoy", "Отношения с отцом", "Как улучшить отношения с отцом?", "Невысказанное и шаги к контакту."),
  family("pochemu-konflikt-v-seme", "Конфликт в семье", "Почему в семье постоянный конфликт?", "Источник напряжения и выход."),
  family("kak-pomoch-rebenku", "Как помочь ребёнку", "Как лучше помочь моему ребёнку?", "Его состояние и ваш вклад."),
  family("chto-proiskhodit-s-roditelyami", "Что с родителями", "Что происходит с моими родителями?", "Их состояние и ваши чувства."),
  family("kak-sohranit-semyu", "Как сохранить семью", "Как сохранить семью?", "Сильные стороны союза и угрозы."),
  family("pochemu-obida-na-rod", "Обida на род", "Почему я злюсь на свой род?", "Корень обиды и исцеление."),
  family("kak-vosstanovit-doverie-v-seme", "Доверие в семье", "Как восстановить доверие в семье?", "Шаги к честности и опоре."),

  // Ritual / energy (8)
  ritual("nuzhen-li-ochist", "Нужна ли очистка", "Нужна ли мне энергетическая очистка?", "Признаки застоя и способ очистки."),
  ritual("kak-snyat-porcu", "Как снять порчу", "Есть ли на мне негатив и как снять?", "Диагностика и рекомендация."),
  ritual("kak-zashchitit-dom", "Как защитить дом", "Как защитить дом энергетически?", "Уязвимости и практика защиты."),
  ritual("kak-privlech-izobilie", "Как привлечь изобилие", "Как привлечь изобилие в жизнь?", "Энергия достатка и действие."),
  ritual("kak-ukrepit-auru", "Как укрепить ауру", "Как укрепить мою ауру?", "Источники утечки и восстановление."),
  ritual("nuzhna-li-meditaciya", "Нужна ли медитация", "Какая практика мне сейчас нужна?", "Медитация, обряд или пауза."),
  ritual("kak-otpustit-proshloe", "Как отпустить прошлое", "Как отпустить тяжёлое прошлое?", "Что держит и как завершить цикл."),
  ritual("kak-nastroit-energiyu-doma", "Энергия дома", "Как настроить энергию в доме?", "Пространство, блоки и гармония."),
];

export { S5, LOVE5, TRIPLET, LOVE7 };
