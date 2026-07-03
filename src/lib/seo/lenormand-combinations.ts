export type LenormandCombination = {
  slug: string;
  title: string;
  cards: [string, string];
  general: string;
  love: string;
  work: string;
  advice: string;
  relatedIntentSlugs: string[];
};

export const LENORMAND_COMBINATIONS: LenormandCombination[] = [
  {
    slug: "klyuch-i-lisa",
    title: "Ключ и Лиса",
    cards: ["Ключ", "Лиса"],
    general: "Открытие через осторожность — доступ к решению есть, но нужна трезвая оценка мотивов.",
    love: "Партнёр может говорить не всё; проверяйте факты, а не только слова.",
    work: "Сделка или договор требуют перепроверки условий.",
    advice: "Держите ключ к ситуации в своих руках — не отдавайте инициативу.",
    relatedIntentSlugs: ["lenormand-liniya", "chto-on-skryvaet"],
  },
  {
    slug: "serdce-i-kolca",
    title: "Сердце и Кольца",
    cards: ["Сердце", "Кольца"],
    general: "Эмоциональная привязанность и обязательства — тема союза и договорённостей.",
    love: "Сильная связь, разговор о статусе отношений или браке.",
    work: "Долгосрочное партнёрство, контракт «на годы».",
    advice: "Честно назовите, чего вы хотите от союза.",
    relatedIntentSlugs: ["budem-li-my-vmeste", "sovmestimost-pary"],
  },
  {
    slug: "krysa-i-luna",
    title: "Крыса и Луна",
    cards: ["Крыса", "Луна"],
    general: "Тревога и неясность — страх потери смешан с недосказанностью.",
    love: "Подозрения могут быть сильнее реальности; уточните, а не додумывайте.",
    work: "Скрытые расходы или неофициальные договорённости.",
    advice: "Выведите скрытое на свет — одним конкретным вопросом.",
    relatedIntentSlugs: ["chto-on-skryvaet", "est-li-izmena"],
  },
  {
    slug: "solnce-i-lebed",
    title: "Солнце и Лебедь",
    cards: ["Солнце", "Лебедь"],
    general: "Ясность и чистота намерений — период открытости и тёплого исхода.",
    love: "Искренность, красивый жест, возможность примирения.",
    work: "Успех виден окружающим; хорошее время для презентации.",
    advice: "Действуйте прямо и без игр.",
    relatedIntentSlugs: ["lenormand-liniya", "blizhayshee-budushchee"],
  },
  {
    slug: "bashnya-i-doroga",
    title: "Башня и Дорога",
    cards: ["Башня", "Дорога"],
    general: "Резкий поворот и новый путь — старое рушится, но маршрут уже намечен.",
    love: "Разрыв или дистанция может открыть другую траекторию связи.",
    work: "Смена должности, переезд, новый проект.",
    advice: "Не цепляйтесь за руины — смотрите, куда ведёт дорога.",
    relatedIntentSlugs: ["stoit-li-menyat-rabotu", "pereezd-kogda"],
  },
  {
    slug: "ryba-i-korabl",
    title: "Рыбы и Корабль",
    cards: ["Рыбы", "Корабль"],
    general: "Много дел и движение — доход через активность и масштаб.",
    love: "Отношения на расстоянии или «каждый в своём ритме».",
    work: "Бизнес растёт, но нужна дисциплина в потоке задач.",
    advice: "Выберите один приоритет в море возможностей.",
    relatedIntentSlugs: ["kuda-ukhodyat-dengi", "novyy-istochnik-dohoda"],
  },
  {
    slug: "gorshok-i-shtuka",
    title: "Горшок и Штука",
    cards: ["Горшок", "Штука"],
    general: "Бытовая тема и конкретный предмет — деньги, покупка, материальный вопрос.",
    love: "Разговор о быте, подарках, совместных тратах.",
    work: "Оплата, премия, материальная выгода от дела.",
    advice: "Сформулируйте вопрос предметно — «сколько / когда / за что».",
    relatedIntentSlugs: ["lenormand-liniya", "kak-uvelichit-dohod"],
  },
  {
    slug: "kniga-i-sova",
    title: "Книга и Сова",
    cards: ["Книга", "Сова"],
    general: "Тайна и мудрость — информация есть, но пока закрыта.",
    love: "Человек знает больше, чем говорит; дайте время.",
    work: "NDA, закрытый проект, экзамен или аттестация.",
    advice: "Не торопите раскрытие — подготовьтесь к правде.",
    relatedIntentSlugs: ["chto-on-skryvaet", "chto-on-dumaet-obo-mne"],
  },
  {
    slug: "lisa-i-medved",
    title: "Лиса и Медведь",
    cards: ["Лиса", "Медведь"],
    general: "Хитрость против силы — кто-то играет умнее, кто-то давит авторитетом.",
    love: "Манипуляция или контроль в паре; ищите баланс власти.",
    work: "Конкуренция с начальством или хитрым партнёром.",
    advice: "Не вступайте в силовую — используйте ясность и факты.",
    relatedIntentSlugs: ["est-li-izmena", "konflikt-na-rabote"],
  },
  {
    slug: "cvetok-i-kosa",
    title: "Цветы и Коса",
    cards: ["Цветы", "Коса"],
    general: "Красота и резкий удар — нежность может обернуться болью.",
    love: "Романтика с риском разочарования; не идеализируйте.",
    work: "Привлекательное предложение с подводным камнем.",
    advice: "Наслаждайтесь моментом, но держите границы.",
    relatedIntentSlugs: ["pauza-ili-konec", "chto-on-chuvstvuet"],
  },
];

export function getAllLenormandCombinationSlugs(): string[] {
  return LENORMAND_COMBINATIONS.map((c) => c.slug);
}

export function getLenormandCombinationBySlug(slug: string): LenormandCombination | undefined {
  return LENORMAND_COMBINATIONS.find((c) => c.slug === slug);
}
