import type { RuneActionType } from "@/lib/rune-costs";

export type TariffService = {
  action: RuneActionType;
  title: string;
  description: string;
  includes: string;
  href: string;
  priceNote?: string;
};

export type TariffGroup = {
  id: string;
  title: string;
  description: string;
  services: readonly TariffService[];
};

/** Only purchasable product actions. Disabled image and extra daily actions stay out of the shop. */
export const TARIFF_GROUPS: readonly TariffGroup[] = [
  {
    id: "tarot",
    title: "Таро и расклады",
    description: "Выберите готовый расклад или обсудите свой вопрос с мастером.",
    services: [
      { action: "READING", title: "Расшифровка расклада", description: "Полная трактовка выбранных карт от мастера: смысл каждой позиции и общий вывод по вопросу.", includes: "Один расклад и его сохранённый ответ", href: "/rasklady" },
      { action: "QUESTION", title: "Вопрос мастеру", description: "Уточнение по раскладу в чате после бесплатных вопросов текущего сеанса.", includes: "Один дополнительный вопрос и ответ", href: "/" },
      { action: "INTENTION_SPREAD", title: "Расклад на тему", description: "Отдельный расклад под вашу ситуацию: отношения, работа, выбор или другая тема.", includes: "Карты, трактовка и итог по выбранной теме", href: "/rasklady", priceNote: "Цена зависит от схемы; итог показываем до подтверждения" },
      { action: "JOINT_READING", title: "Совместный расклад", description: "Расклад для двух людей с разбором динамики отношений и точек взаимодействия.", includes: "Один совместный расклад и трактовка", href: "/joint-reading" },
      { action: "VISION_ANALYSIS", title: "Фото расклада", description: "Загрузите фотографию разложенных карт: сервис распознает их и подготовит трактовку.", includes: "Распознавание карт, визуализация и полный разбор", href: "/photo-rasklad" },
    ],
  },
  {
    id: "matrix",
    title: "Матрица судьбы и нумерология",
    description: "Числа можно рассчитать бесплатно; руны списываются за полный персональный разбор.",
    services: [
      { action: "NUMEROLOGY_SESSION", title: "Полный разбор матрицы", description: "Интерпретация вашей матрицы судьбы от Эвелины с сохранением результата для повторного чтения.", includes: "Один полный разбор и 3 вопроса по нему", href: "/numerology/destiny-matrix" },
      { action: "MATRIX_SUBJECT_REPORT", title: "Матрица другого человека", description: "Отдельный персональный разбор для добавленного человека по его дате рождения.", includes: "Один разбор выбранного профиля", href: "/numerology/destiny-matrix" },
      { action: "CHILD_MATRIX_REPORT", title: "Детская матрица", description: "Разбор матрицы ребёнка с акцентом на особенности, сильные стороны и развитие.", includes: "Один детский отчёт", href: "/numerology/detskaya-matritsa" },
      { action: "MATRIX_PAIR_REPORT", title: "Матрица совместимости", description: "Разбор пары по двум датам рождения: общие задачи и динамика отношений.", includes: "Один полный отчёт о совместимости", href: "/numerology/matrica-sovmestimosti" },
      { action: "MATRIX_YEAR_FORECAST", title: "Прогноз по матрице на год", description: "Персональный обзор периода на 12 месяцев по вашей матрице.", includes: "Один годовой прогноз", href: "/numerology/destiny-matrix" },
    ],
  },
  {
    id: "astrology",
    title: "Астрология",
    description: "Расчёт карты доступен отдельно от платных текстовых отчётов.",
    services: [
      { action: "NATAL_READING", title: "Полная натальная трактовка", description: "Глубокая интерпретация одной натальной карты в выбранной традиции — западной или ведической.", includes: "Один полный персональный отчёт", href: "/natalnaya-karta" },
      { action: "FORECAST_REPORT", title: "Персональный прогноз", description: "Прогноз по натальной карте на выбранный период с акцентом на значимые темы.", includes: "Один прогноз выбранного горизонта", href: "/cabinet/astrology" },
      { action: "SYNASTRY_REPORT", title: "Натальная совместимость", description: "Сопоставление двух натальных карт и композита с разбором отношений.", includes: "Один отчёт для выбранной пары", href: "/natalnaya-karta/sovmestimost" },
    ],
  },
  {
    id: "design",
    title: "Дизайн Человека",
    description: "Бесплатный расчёт бодиграфа и подробные разборы карты.",
    services: [
      { action: "HD_REPORT", title: "Полный разбор бодиграфа", description: "Персональная интерпретация типа, стратегии, авторитета, профиля и ключевых элементов карты.", includes: "Отчёт, печать/PDF и 5 вопросов по разбору", href: "/dizayn-cheloveka" },
      { action: "HD_COMPOSITE_REPORT", title: "Карта связи двух людей", description: "Совместный бодиграф и разбор того, как взаимодействуют две карты.", includes: "Один отчёт о связи и печать/PDF", href: "/dizayn-cheloveka/sovmestimost" },
      { action: "HD_ASK", title: "Дополнительный вопрос", description: "Уточнение по уже купленному разбору после включённых вопросов.", includes: "Один дополнительный ответ", href: "/dizayn-cheloveka" },
    ],
  },
  {
    id: "photo",
    title: "Разборы по фото",
    description: "Визуальный отчёт по загруженному снимку.",
    services: [
      { action: "AURA_READING", title: "Аура по фото", description: "Полный отчёт о цветах и слоях поля, чакрах и персональной практике.", includes: "Один сохранённый отчёт по фото", href: "/aura" },
      { action: "PALM_READING", title: "Ладонь по фото", description: "Разбор типа руки, основных линий, холмов и знаков с практическим выводом.", includes: "Один сохранённый отчёт по фото", href: "/gadanie-po-ladoni" },
    ],
  },
  {
    id: "extras",
    title: "Дополнения в чате",
    description: "Покупаются отдельно, когда вы выбираете их в сеансе.",
    services: [
      { action: "VOICE_TTS", title: "Озвучка ответа", description: "Прослушивание текстового ответа мастера голосом.", includes: "Цена за каждые 2 000 символов текста", href: "/", priceNote: "Длинный ответ может стоить несколько единиц" },
    ],
  },
];
