import type { SpreadId } from "@/lib/spreads";
import type { SpreadIntentCategory, SpreadIntentDefinition } from "./types";

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

type IntentSeed = {
  slug: string;
  title: string;
  category: SpreadIntentCategory;
  spreadId: SpreadId;
  master?: string;
  question: string;
  intro: string;
  positions: readonly string[];
  related?: string[];
  featured?: boolean;
};

function defaultMaster(category: SpreadIntentCategory): string {
  switch (category) {
    case "love":
    case "choice":
      return "veronika";
    case "career":
    case "money":
      return "ragnar";
    case "future":
    case "family":
    case "ritual":
      return "agafya";
    case "self":
      return "shri-raj";
    default:
      return "veronika";
  }
}

function buildIntent(seed: IntentSeed): SpreadIntentDefinition {
  const master = seed.master ?? defaultMaster(seed.category);
  return {
    slug: seed.slug,
    title: seed.title,
    description: seed.intro,
    category: seed.category,
    spreadId: seed.spreadId,
    recommendedMasterId: master,
    questionTemplate: seed.question,
    seoTitle: `${seed.title} — расклад Таро онлайн | Zovus`,
    seoDescription: `${seed.intro} Персональный расклад с ИИ-мастером Zovus: память сессии, чат и расшифровка.`,
    h1: seed.title,
    intro: seed.intro,
    positionsPreview: [...seed.positions],
    relatedSlugs: seed.related ?? [],
    runeAction: "INTENTION_SPREAD",
    isFeatured: seed.featured,
  };
}

const SEEDS: IntentSeed[] = [
  // Love
  {
    slug: "chto-on-chuvstvuet",
    title: "Что он чувствует",
    category: "love",
    spreadId: "situation-5",
    question: "Покажи, что он чувствует ко мне сейчас.",
    intro: "Расклад на его мысли, чувства и скрытые мотивы — когда хочется понять, что происходит между вами.",
    positions: LOVE5,
    related: ["lyubit-li-on-menya", "chto-on-skryvaet", "chto-on-dumaet-obo-mne"],
    featured: true,
  },
  {
    slug: "vernyotsya-li-on",
    title: "Вернётся ли он",
    category: "love",
    spreadId: "situation-5",
    question: "Вернётся ли он после расставания?",
    intro: "Что между вами сейчас, движется ли он навстречу и к чему может привести пауза.",
    positions: LOVE5,
    related: ["zhdat-ili-zabyt", "pauza-ili-konec", "chto-mezhdu-nami"],
    featured: true,
  },
  {
    slug: "lyubit-li-on-menya",
    title: "Любит ли он меня",
    category: "love",
    spreadId: "situation-5",
    question: "Есть ли у него настоящее чувство ко мне?",
    intro: "Проверка искренности чувств — не только слова, но и энергия связи.",
    positions: LOVE5,
    related: ["chto-on-chuvstvuet", "budem-li-my-vmeste", "perspektiva-otnosheniy"],
    featured: true,
  },
  {
    slug: "chto-on-skryvaet",
    title: "Что он скрывает",
    category: "love",
    spreadId: "situation-5",
    question: "Что он от меня скрывает?",
    intro: "Что остаётся невысказанным — мысли, страхи и намерения за молчанием.",
    positions: LOVE5,
    related: ["chto-on-chuvstvuet", "est-li-u-nego-drugaya", "pochemu-on-molchit"],
  },
  {
    slug: "pochemu-on-molchit",
    title: "Почему он молчит",
    category: "love",
    spreadId: "situation-5",
    question: "Почему он меня игнорирует и молчит?",
    intro: "Истинная причина дистанции и холодка — что стоит за молчанием.",
    positions: LOVE5,
    related: ["chto-on-skryvaet", "stoit-li-pisat-pervoy", "zhdat-ili-zabyt"],
  },
  {
    slug: "budem-li-my-vmeste",
    title: "Будем ли мы вместе",
    category: "love",
    spreadId: "love-7",
    question: "Есть ли у нас общее будущее?",
    intro: "Глубокий расклад на перспективу пары — силы, слабые места и итог.",
    positions: LOVE7,
    related: ["perspektiva-otnosheniy", "lyubit-li-on-menya", "chto-mezhdu-nami"],
    featured: true,
  },
  {
    slug: "est-li-u-nego-drugaya",
    title: "Есть ли у него другая",
    category: "love",
    spreadId: "situation-5",
    question: "Есть ли у него другая женщина?",
    intro: "Свободно ли его сердце и насколько реальна угроза соперницы.",
    positions: LOVE5,
    related: ["chto-on-skryvaet", "chto-mezhdu-nami", "zhdat-ili-zabyt"],
  },
  {
    slug: "stoit-li-pisat-pervoy",
    title: "Стоит ли написать первой",
    category: "love",
    spreadId: "yes-no",
    question: "Стоит ли мне написать ему первой?",
    intro: "Быстрый ответ: делать ли первый шаг или дать пространство.",
    positions: ["Ответ"],
    related: ["vernyotsya-li-on", "pochemu-on-molchit", "chto-on-chuvstvuet"],
  },
  {
    slug: "zhdat-ili-zabyt",
    title: "Ждать или забыть",
    category: "love",
    spreadId: "situation-5",
    question: "Ждать его или отпустить?",
    intro: "Два пути — держаться за связь или отпустить с достоинством.",
    positions: S5,
    related: ["vernyotsya-li-on", "kak-otpustit-cheloveka", "pauza-ili-konec"],
    featured: true,
  },
  {
    slug: "kogda-ya-vstrechu-lyubov",
    title: "Когда я встречу любовь",
    category: "love",
    spreadId: "situation-5",
    question: "Когда я встречу любовь?",
    intro: "Что должно созреть внутри и снаружи, чтобы пришла встреча.",
    positions: S5,
    related: ["pochemu-ya-odna", "sovmestimost-pary", "perspektiva-otnosheniy"],
  },
  {
    slug: "chto-mezhdu-nami",
    title: "Что между нами",
    category: "love",
    spreadId: "triplet-love",
    question: "Что на самом деле между нами?",
    intro: "Вы, партнёр и перспектива — суть связи в трёх картах.",
    positions: ["Вы", "Партнёр", "Перспектива"],
    related: ["chto-on-chuvstvuet", "budem-li-my-vmeste", "perspektiva-otnosheniy"],
  },
  {
    slug: "perspektiva-otnosheniy",
    title: "Перспектива отношений",
    category: "love",
    spreadId: "love-7",
    question: "К чему идут наши отношения?",
    intro: "Семь позиций — динамика пары, слабые места и совет карт.",
    positions: LOVE7,
    related: ["budem-li-my-vmeste", "chto-mezhdu-nami", "sovmestimost-pary"],
  },
  {
    slug: "sovmestimost-pary",
    title: "Совместимость пары",
    category: "love",
    spreadId: "love-7",
    question: "Насколько мы совместимы как пара?",
    intro: "Глубокий разбор двух людей — связь, силы и точки роста.",
    positions: LOVE7,
    related: ["perspektiva-otnosheniy", "budem-li-my-vmeste", "chto-mezhdu-nami"],
    featured: true,
  },
  {
    slug: "pauza-ili-konec",
    title: "Пауза или конец",
    category: "love",
    spreadId: "situation-5",
    question: "Это пауза или конец отношений?",
    intro: "Временная дистанция или окончательный разрыв — что показывают карты.",
    positions: S5,
    related: ["zhdat-ili-zabyt", "vernyotsya-li-on", "ostatsya-ili-uyti"],
  },
  {
    slug: "chto-on-dumaet-obo-mne",
    title: "Что он думает обо мне",
    category: "love",
    spreadId: "situation-5",
    question: "Что он думает обо мне?",
    intro: "Его мысли, чувства и намерения — без догадок и тревоги.",
    positions: LOVE5,
    related: ["chto-on-chuvstvuet", "lyubit-li-on-menya", "chto-on-skryvaet"],
  },
  // Money / career
  {
    slug: "na-dengi",
    title: "На деньги",
    category: "money",
    spreadId: "situation-5",
    question: "Что сейчас с моими деньгами и куда они движутся?",
    intro: "Срез финансовой ситуации — поток, препятствия и совет.",
    positions: S5,
    related: ["kuda-ukhodyat-dengi", "kak-uvelichit-dohod", "denezhnyy-blok"],
    featured: true,
  },
  {
    slug: "kuda-ukhodyat-dengi",
    title: "Куда уходят деньги",
    category: "money",
    spreadId: "situation-5",
    question: "Куда уходят мои деньги?",
    intro: "Что помогает удерживать ресурс и где происходит утечка.",
    positions: S5,
    related: ["na-dengi", "kak-uvelichit-dohod", "est-li-denezhnyy-blok"],
    featured: true,
  },
  {
    slug: "kak-uvelichit-dohod",
    title: "Как увеличить доход",
    category: "money",
    spreadId: "situation-5",
    question: "Как увеличить мой доход?",
    intro: "Текущий поток, скрытый ресурс и шаг роста.",
    positions: S5,
    related: ["na-dengi", "novyy-istochnik-dohoda", "denezhnyy-blok"],
  },
  {
    slug: "stoit-li-menyat-rabotu",
    title: "Стоит ли менять работу",
    category: "career",
    spreadId: "situation-5",
    question: "Стоит ли мне менять работу?",
    intro: "Текущее место, новое, риски и совет карт.",
    positions: S5,
    related: ["stoit-li-uvolnyatsya", "budet-li-povyshenie", "na-biznes"],
    featured: true,
  },
  {
    slug: "stoit-li-uvolnyatsya",
    title: "Стоит ли увольняться",
    category: "career",
    spreadId: "situation-5",
    question: "Стоит ли мне уволиться с этой работы?",
    intro: "Уйти или остаться — что покажет расклад на ситуацию.",
    positions: S5,
    related: ["stoit-li-menyat-rabotu", "budet-li-povyshenie", "rabota-ili-svoy-biznes"],
  },
  {
    slug: "budet-li-povyshenie",
    title: "Будет ли повышение",
    category: "career",
    spreadId: "situation-5",
    question: "Будет ли мне повышение на работе?",
    intro: "Перспектива роста в должности и что на это влияет.",
    positions: S5,
    related: ["stoit-li-menyat-rabotu", "na-biznes", "novyy-istochnik-dohoda"],
  },
  {
    slug: "na-biznes",
    title: "На бизнес",
    category: "career",
    spreadId: "situation-5",
    question: "Что помогает и что мешает моему делу?",
    intro: "Расклад для предпринимателей — ресурс, блок и итог.",
    positions: S5,
    related: ["rabota-ili-svoy-biznes", "novyy-istochnik-dohoda", "stoit-li-menyat-rabotu"],
  },
  {
    slug: "stoit-li-brat-kredit",
    title: "Стоит ли брать кредит",
    category: "money",
    spreadId: "situation-5",
    question: "Стоит ли мне брать кредит?",
    intro: "Риски, выгода и совет карт по финансовому решению.",
    positions: S5,
    related: ["na-dengi", "stoit-li-vkladyvat", "kuda-ukhodyat-dengi"],
  },
  {
    slug: "stoit-li-vkladyvat",
    title: "Стоит ли вкладывать",
    category: "money",
    spreadId: "situation-5",
    question: "Выгодна ли эта инвестиция?",
    intro: "Оценка риска и перспективы вложения.",
    positions: S5,
    related: ["stoit-li-brat-kredit", "na-dengi", "novyy-istochnik-dohoda"],
  },
  {
    slug: "novyy-istochnik-dohoda",
    title: "Новый источник дохода",
    category: "money",
    spreadId: "situation-5",
    question: "Откуда может прийти новый доход?",
    intro: "Скрытый ресурс и направление для роста заработка.",
    positions: S5,
    related: ["kak-uvelichit-dohod", "na-biznes", "rabota-ili-svoy-biznes"],
  },
  {
    slug: "denezhnyy-blok",
    title: "Денежные блоки",
    category: "money",
    spreadId: "situation-5",
    question: "Что мешает моему денежному потоку?",
    intro: "Скрытые препятствия и точка разблокировки.",
    positions: S5,
    related: ["na-dengi", "kak-uvelichit-dohod", "est-li-denezhnyy-blok"],
  },
  {
    slug: "rabota-ili-svoy-biznes",
    title: "Фриланс или найм",
    category: "career",
    spreadId: "situation-5",
    question: "Какой путь мне ближе — найм или своё дело?",
    intro: "Два сценария и совет карт для карьерного выбора.",
    positions: S5,
    related: ["na-biznes", "stoit-li-menyat-rabotu", "novyy-istochnik-dohoda"],
  },
  // Future
  {
    slug: "na-segodnya",
    title: "На сегодня",
    category: "future",
    spreadId: "triplet",
    question: "Какой настрой и совет на сегодня?",
    intro: "Быстрый прогноз на день — утро, день и вечер в трёх картах.",
    positions: TRIPLET,
    related: ["na-zavtra", "karta-dnya", "blizhayshee-budushchee"],
    featured: true,
  },
  {
    slug: "na-zavtra",
    title: "На завтра",
    category: "future",
    spreadId: "triplet",
    question: "Чем будет дышать завтрашний день?",
    intro: "Краткий прогноз на ближайшие сутки.",
    positions: TRIPLET,
    related: ["na-segodnya", "blizhayshee-budushchee", "chto-menya-zhdet"],
  },
  {
    slug: "na-nedelyu",
    title: "На неделю",
    category: "future",
    spreadId: "daily-extended",
    question: "Что ждёт меня на этой неделе?",
    intro: "Расширенный обзор недели по сферам жизни.",
    positions: ["Утро", "Дела", "Отношения", "Энергия", "Вечер", "Совет", "Послание"],
    related: ["na-mesyats", "blizhayshee-budushchee", "na-segodnya"],
  },
  {
    slug: "na-mesyats",
    title: "На месяц",
    category: "future",
    spreadId: "situation-5",
    question: "Чем будет наполнен ближайший месяц?",
    intro: "Четыре недели и общий вектор — через расклад на ситуацию.",
    positions: S5,
    related: ["na-nedelyu", "god-vpered", "blizhayshee-budushchee"],
  },
  {
    slug: "god-vpered",
    title: "Год вперёд",
    category: "future",
    spreadId: "celtic-cross",
    question: "Что несёт мне ближайший год?",
    intro: "Глубокий расклад Кельтский крест — десять позиций на годовой цикл.",
    positions: [
      "Настоящее",
      "Вызов",
      "Прошлое",
      "Будущее",
      "Сознание",
      "Подсознание",
      "Совет",
      "Окружение",
      "Надежды",
      "Итог",
    ],
    related: ["na-mesyats", "moya-tsel-na-god", "blizhayshee-budushchee"],
  },
  {
    slug: "karta-dnya",
    title: "Карта дня",
    category: "future",
    spreadId: "single",
    question: "Какое послание на сегодня?",
    intro: "Одна карта — быстрый ориентир и совет дня.",
    positions: ["Послание"],
    related: ["na-segodnya", "na-zavtra", "blizhayshee-budushchee"],
    featured: true,
  },
  {
    slug: "blizhayshee-budushchee",
    title: "Ближайшее будущее",
    category: "future",
    spreadId: "triplet",
    question: "Что ждёт меня в ближайшем будущем?",
    intro: "Хронологический срез — прошлое, настоящее и ближайший итог.",
    positions: TRIPLET,
    related: ["chto-menya-zhdet", "na-segodnya", "kakoe-sobytie-na-poroge"],
    featured: true,
  },
  {
    slug: "chto-menya-zhdet",
    title: "Что меня ждёт",
    category: "future",
    spreadId: "situation-5",
    question: "Что меня ждёт в скором времени?",
    intro: "Суть ситуации, силы и вероятный исход.",
    positions: S5,
    related: ["blizhayshee-budushchee", "kakoe-sobytie-na-poroge", "na-mesyats"],
  },
  {
    slug: "kakoe-sobytie-na-poroge",
    title: "Какое событие на пороге",
    category: "future",
    spreadId: "situation-5",
    question: "Какое важное событие приближается ко мне?",
    intro: "Что готовится войти в жизнь и как к этому отнестись.",
    positions: S5,
    related: ["chto-menya-zhdet", "blizhayshee-budushchee", "na-mesyats"],
  },
  // Self
  {
    slug: "chto-so-mnoy-proiskhodit",
    title: "Что со мной происходит",
    category: "self",
    spreadId: "situation-5",
    question: "Что со мной происходит на самом деле?",
    intro: "Суть текущего периода — что помогает, что мешает и куда ведёт.",
    positions: S5,
    related: ["chto-menya-tormozit", "moy-potentsial", "vnutrenniy-konflikt"],
    featured: true,
  },
  {
    slug: "moyo-prednaznachenie",
    title: "Моё предназначение",
    category: "self",
    spreadId: "celtic-cross",
    master: "shri-raj",
    question: "В чём моё предназначение и куда оно зовёт?",
    intro: "Глубокий кармический разбор — десять позиций на путь души.",
    positions: [
      "Настоящее",
      "Вызов",
      "Прошлое",
      "Будущее",
      "Сознание",
      "Подсознание",
      "Совет",
      "Окружение",
      "Надежды",
      "Итог",
    ],
    related: ["karmicheskiy-urok", "moy-dar", "moy-potentsial"],
  },
  {
    slug: "chto-menya-tormozit",
    title: "Что меня тормозит",
    category: "self",
    spreadId: "situation-5",
    question: "Что мешает мне двигаться вперёд?",
    intro: "Скрытые блоки, паттерны и точка разблокировки.",
    positions: S5,
    related: ["chto-so-mnoy-proiskhodit", "vnutrenniy-konflikt", "moya-tochka-sily"],
  },
  {
    slug: "moy-potentsial",
    title: "Мой потенциал",
    category: "self",
    spreadId: "situation-5",
    question: "Где моя сила и как её раскрыть?",
    intro: "Ресурс, препятствие и путь реализации.",
    positions: S5,
    related: ["moy-dar", "moya-tochka-sily", "chto-menya-tormozit"],
  },
  {
    slug: "vnutrenniy-konflikt",
    title: "Внутренний конфликт",
    category: "self",
    spreadId: "situation-5",
    question: "Что во мне спорит и как примирить?",
    intro: "Две части личности и путь к внутренней целостности.",
    positions: S5,
    related: ["chto-so-mnoy-proiskhodit", "chto-otpustit", "moya-tochka-sily"],
  },
  {
    slug: "chto-otpustit",
    title: "Что отпустить",
    category: "self",
    spreadId: "situation-5",
    master: "agafya",
    question: "Что мне пора отпустить?",
    intro: "Что держит и что освободит энергию для нового.",
    positions: S5,
    related: ["kak-otpustit-cheloveka", "vnutrenniy-konflikt", "karmicheskiy-urok"],
  },
  {
    slug: "moya-tochka-sily",
    title: "Моя точка силы",
    category: "self",
    spreadId: "triplet",
    question: "На что мне опереться сейчас?",
    intro: "Три опоры — прошлый ресурс, настоящее и направление.",
    positions: TRIPLET,
    related: ["moy-potentsial", "moy-dar", "chto-menya-tormozit"],
  },
  {
    slug: "karmicheskiy-urok",
    title: "Кармический урок",
    category: "self",
    spreadId: "situation-5",
    master: "shri-raj",
    question: "Какой повторяющийся урок несёт моя жизнь?",
    intro: "Корень паттерна и путь выхода.",
    positions: S5,
    related: ["moyo-prednaznachenie", "chto-otpustit", "vnutrenniy-konflikt"],
  },
  {
    slug: "moy-dar",
    title: "Мой дар",
    category: "self",
    spreadId: "situation-5",
    master: "shri-raj",
    question: "В чём мой талант и призвание?",
    intro: "Скрытый дар и как его проявить.",
    positions: S5,
    related: ["moy-potentsial", "moyo-prednaznachenie", "moya-tochka-sily"],
  },
  {
    slug: "moya-tsel-na-god",
    title: "Моя цель на год",
    category: "self",
    spreadId: "situation-5",
    question: "Куда направить силы в этом году?",
    intro: "Фокус года — ресурс, препятствие и итог.",
    positions: S5,
    related: ["god-vpered", "chto-menya-tormozit", "moy-potentsial"],
  },
  // Choice / ritual
  {
    slug: "stoit-li-idti-dalshe",
    title: "Стоит ли идти дальше",
    category: "choice",
    spreadId: "situation-5",
    question: "Стоит ли мне идти дальше в этой ситуации?",
    intro: "Продолжать путь или остановиться — совет карт.",
    positions: S5,
    related: ["pravilno-li-ya-postupayu", "ostatsya-ili-uyti", "chto-delat-dalshe"],
    featured: true,
  },
  {
    slug: "pravilno-li-ya-postupayu",
    title: "Правильно ли я поступаю",
    category: "choice",
    spreadId: "yes-no",
    question: "Правильно ли я поступаю?",
    intro: "Быстрый ответ на моральный или жизненный выбор.",
    positions: ["Ответ"],
    related: ["stoit-li-idti-dalshe", "chto-delat-dalshe", "ostatsya-ili-uyti"],
    featured: true,
  },
  {
    slug: "nuzhna-li-zashchita",
    title: "Нужна ли защита",
    category: "ritual",
    spreadId: "situation-5",
    master: "agafya",
    question: "Нужна ли мне энергетическая защита?",
    intro: "Есть ли чужое влияние и что поможет поставить границу.",
    positions: S5,
    related: ["kak-vernut-energiyu", "kak-privlech-udachu", "chto-so-mnoy-proiskhodit"],
    featured: true,
  },
  {
    slug: "kak-otpustit-cheloveka",
    title: "Как отпустить человека",
    category: "ritual",
    spreadId: "situation-5",
    master: "agafya",
    question: "Как мне отпустить этого человека?",
    intro: "Что держит связь и как мягко завершить цикл.",
    positions: S5,
    related: ["zhdat-ili-zabyt", "chto-otpustit", "pauza-ili-konec"],
    featured: true,
  },
  {
    slug: "est-li-denezhnyy-blok",
    title: "Есть ли денежный блок",
    category: "ritual",
    spreadId: "situation-5",
    master: "ragnar",
    question: "Есть ли у меня блок на деньги?",
    intro: "Энергия достатка — где зажато и что разблокировать.",
    positions: S5,
    related: ["denezhnyy-blok", "na-dengi", "kak-uvelichit-dohod"],
  },
  {
    slug: "kak-privlech-udachu",
    title: "Как привлечь удачу",
    category: "ritual",
    spreadId: "situation-5",
    master: "ragnar",
    question: "Как привлечь удачу в нужной сфере?",
    intro: "Где сейчас ваш шанс и что усилит поток.",
    positions: S5,
    related: ["nuzhna-li-zashchita", "kak-vernut-energiyu", "blizhayshee-budushchee"],
  },
  {
    slug: "kak-vernut-energiyu",
    title: "Как вернуть энергию",
    category: "ritual",
    spreadId: "situation-5",
    master: "agafya",
    question: "Как мне вернуть силы и энергию?",
    intro: "Где энергия утекает и что поможет восстановиться.",
    positions: S5,
    related: ["nuzhna-li-zashchita", "chto-so-mnoy-proiskhodit", "kak-privlech-udachu"],
  },
  {
    slug: "chto-delat-dalshe",
    title: "Что делать дальше",
    category: "choice",
    spreadId: "situation-5",
    question: "Что мне делать дальше?",
    intro: "Следующий шаг из текущей точки — совет карт.",
    positions: S5,
    related: ["stoit-li-idti-dalshe", "pravilno-li-ya-postupayu", "ostatsya-ili-uyti"],
  },
  {
    slug: "ostatsya-ili-uyti",
    title: "Остаться или уйти",
    category: "choice",
    spreadId: "situation-5",
    question: "Остаться или уйти?",
    intro: "Два пути и их последствия.",
    positions: S5,
    related: ["zhdat-ili-zabyt", "pauza-ili-konec", "stoit-li-idti-dalshe"],
  },
  {
    slug: "pochemu-ya-odna",
    title: "Почему я одна",
    category: "love",
    spreadId: "situation-5",
    question: "Почему у меня не складывается личная жизнь?",
    intro: "Внутренний блок, что отталкивает и путь к встрече.",
    positions: S5,
    related: ["kogda-ya-vstrechu-lyubov", "chto-menya-tormozit", "karmicheskiy-urok"],
  },
];

export const SPREAD_INTENT_REGISTRY: SpreadIntentDefinition[] = SEEDS.map(buildIntent);

const BY_SLUG = new Map(SPREAD_INTENT_REGISTRY.map((i) => [i.slug, i]));

export function getSpreadIntentBySlug(slug: string): SpreadIntentDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function getAllSpreadIntents(): SpreadIntentDefinition[] {
  return SPREAD_INTENT_REGISTRY;
}

export function getFeaturedSpreadIntents(limit = 8): SpreadIntentDefinition[] {
  return SPREAD_INTENT_REGISTRY.filter((i) => i.isFeatured).slice(0, limit);
}

export function getSpreadIntentsByCategory(
  category: SpreadIntentCategory
): SpreadIntentDefinition[] {
  return SPREAD_INTENT_REGISTRY.filter((i) => i.category === category);
}

export function getRelatedSpreadIntents(
  intent: SpreadIntentDefinition,
  limit = 4
): SpreadIntentDefinition[] {
  const related: SpreadIntentDefinition[] = [];
  for (const slug of intent.relatedSlugs) {
    const item = BY_SLUG.get(slug);
    if (item && item.slug !== intent.slug) related.push(item);
    if (related.length >= limit) break;
  }
  if (related.length < limit) {
    for (const item of SPREAD_INTENT_REGISTRY) {
      if (item.slug === intent.slug) continue;
      if (item.category !== intent.category) continue;
      if (related.some((r) => r.slug === item.slug)) continue;
      related.push(item);
      if (related.length >= limit) break;
    }
  }
  return related;
}

export function generateSpreadIntentStaticParams(): { slug: string }[] {
  return SPREAD_INTENT_REGISTRY.map((i) => ({ slug: i.slug }));
}
