export interface CardCombinationDefinition {
  slug: string;
  title: string;
  cards: [string, string];
  general: string;
  love: string;
  money: string;
  advice: string;
  relatedIntentSlugs: string[];
}

export const CARD_COMBINATIONS: CardCombinationDefinition[] = [
  {
    slug: "vlyublennye-i-bashnya",
    title: "Влюблённые и Башня",
    cards: ["Влюблённые", "Башня"],
    general: "Резкий перелом в теме выбора и отношений — старые конструкции рушатся, чтобы освободить правду.",
    love: "В паре возможен кризис или неожиданное прояснение. Связь либо укрепляется после шока, либо завершается честно.",
    money: "Решение в работе или партнёрстве может обрушить привычную схему — но открывает более честный путь.",
    advice: "Не цепляйтесь за форму — смотрите, что остаётся живым после потрясения.",
    relatedIntentSlugs: ["pauza-ili-konec", "chto-mezhdu-nami", "ostatsya-ili-uyti"],
  },
  {
    slug: "luna-i-dyavol",
    title: "Луна и Дьявол",
    cards: ["Луна", "Дьявол"],
    general: "Иллюзии и сильная привязанность — тема соблазна, страха и скрытых мотивов.",
    love: "Страсть может быть смешана с зависимостью или ревностью. Важно отличать притяжение от ловушки.",
    money: "Рискованные предложения или эмоциональные траты. Проверьте, не управляет ли вами страх потери.",
    advice: "Назовите страх вслух — тогда он теряет власть.",
    relatedIntentSlugs: ["chto-on-skryvaet", "est-li-u-nego-drugaya", "chto-so-mnoy-proiskhodit"],
  },
  {
    slug: "imperatritsa-i-solntse",
    title: "Императрица и Солнце",
    cards: ["Императрица", "Солнце"],
    general: "Изобилие, рост и радость — период, когда жизнь хочет расцвести.",
    love: "Тёплая, щедрая энергия в отношениях. Хорошее время для сближения и открытости.",
    money: "Рост, плодотворные проекты и видимый результат труда.",
    advice: "Позвольте себе принимать и делиться — не сжимайте поток.",
    relatedIntentSlugs: ["budem-li-my-vmeste", "kak-uvelichit-dohod", "moy-potentsial"],
  },
  {
    slug: "smert-i-mir",
    title: "Смерть и Мир",
    cards: ["Смерть", "Мир"],
    general: "Завершение цикла и целостность — трансформация, которая ведёт к гармонии.",
    love: "Старый этап отношений завершён; возможен новый уровень близости или мирное отпускание.",
    money: "Переход к новой финансовой фазе после закрытия старой истории.",
    advice: "Примите завершение как дверь, а не как потерю.",
    relatedIntentSlugs: ["chto-otpustit", "kak-otpustit-cheloveka", "god-vpered"],
  },
  {
    slug: "mag-i-koleso-fortuny",
    title: "Маг и Колесо Фортуны",
    cards: ["Маг", "Колесо Фортуны"],
    general: "Сила воли встречает поворот судьбы — вы можете направить шанс в нужную сторону.",
    love: "Неожиданная встреча или поворот в отношениях. Действуйте осознанно.",
    money: "Окно возможностей открыто — важно не упустить момент.",
    advice: "Сфокусируйтесь на одном решении и сделайте его.",
    relatedIntentSlugs: ["kakoe-sobytie-na-poroge", "blizhayshee-budushchee", "novyy-istochnik-dohoda"],
  },
  {
    slug: "zhritsa-i-luna",
    title: "Жрица и Луна",
    cards: ["Жрица", "Луна"],
    general: "Глубокая интуиция и тайна — не всё видно сразу, но внутренний голос точен.",
    love: "Чувства сильнее слов. Наблюдайте, не давите на ясность.",
    money: "Скрытая информация влияет на решение. Не спешите с подписью.",
    advice: "Доверьтесь тишине — ответ придёт не через анализ, а через чувство.",
    relatedIntentSlugs: ["chto-on-chuvstvuet", "chto-on-skryvaet", "na-segodnya"],
  },
  {
    slug: "bashnya-i-sud",
    title: "Башня и Суд",
    cards: ["Башня", "Суд"],
    general: "Разрушение старого ведёт к пробуждению и новому призванию.",
    love: "Кризис может стать точкой честного перерождения пары.",
    money: "После потрясения — шанс выстроить дело на новых основаниях.",
    advice: "Не бойтесь правды, которая разрушает ложь.",
    relatedIntentSlugs: ["pauza-ili-konec", "moyo-prednaznachenie", "chto-so-mnoy-proiskhodit"],
  },
  {
    slug: "zvezda-i-umerennost",
    title: "Звезда и Умеренность",
    cards: ["Звезда", "Умеренность"],
    general: "Исцеление через терпение — надежда и мягкий баланс.",
    love: "Период восстановления доверия. Маленькие шаги важнее резких.",
    money: "Стабильный рост без резких скачков.",
    advice: "Действуйте спокойно и регулярно — не форсируйте.",
    relatedIntentSlugs: ["perspektiva-otnosheniy", "kak-vernut-energiyu", "na-mesyats"],
  },
  {
    slug: "dyavol-i-vlyublennye",
    title: "Дьявол и Влюблённые",
    cards: ["Дьявол", "Влюблённые"],
    general: "Выбор между страстью и зависимостью — тема соблазна и свободы.",
    love: "Сильное притяжение, но важно видеть, не держит ли связь страх или привычка.",
    money: "Выгодное, но рискованное предложение. Проверьте мотивы.",
    advice: "Спросите себя: это любовь или цепь?",
    relatedIntentSlugs: ["lyubit-li-on-menya", "est-li-u-nego-drugaya", "zhdat-ili-zabyt"],
  },
  {
    slug: "otshelnik-i-poveshennyy",
    title: "Отшельник и Повешенный",
    cards: ["Отшельник", "Повешенный"],
    general: "Пауза для глубокого переосмысления — время не действовать, а видеть иначе.",
    love: "Дистанция может быть нужна для ясности, а не как наказание.",
    money: "Не лучший момент для резких шагов — соберите информацию.",
    advice: "Остановитесь и посмотрите на ситуацию под другим углом.",
    relatedIntentSlugs: ["pochemu-on-molchit", "zhdat-ili-zabyt", "chto-delat-dalshe"],
  },
  {
    slug: "imperator-i-spravedlivost",
    title: "Император и Справедливость",
    cards: ["Император", "Справедливость"],
    general: "Структура, порядок и баланс — решение через ответственность.",
    love: "В отношениях важны границы, честность и равновесие.",
    money: "Юридические или деловые вопросы требуют ясных правил.",
    advice: "Примите решение, которое выдержит проверку совестью.",
    relatedIntentSlugs: ["pravilno-li-ya-postupayu", "stoit-li-menyat-rabotu", "ostatsya-ili-uyti"],
  },
  {
    slug: "solntse-i-mir",
    title: "Солнце и Мир",
    cards: ["Солнце", "Мир"],
    general: "Радость и завершённость — успех и целостность.",
    love: "Светлый период в отношениях, гармония и открытость.",
    money: "Удачное завершение проекта или финансовый успех.",
    advice: "Примите результат и поделитесь радостью.",
    relatedIntentSlugs: ["budem-li-my-vmeste", "kak-uvelichit-dohod", "na-segodnya"],
  },
  {
    slug: "kolesnitsa-i-sila",
    title: "Колесница и Сила",
    cards: ["Колесница", "Сила"],
    general: "Движение вперёд через мягкую силу — победа без агрессии.",
    love: "Активный шаг в отношениях, но без давления.",
    money: "Прогресс в карьере при сохранении баланса.",
    advice: "Двигайтесь уверенно, но не ломайте себя и других.",
    relatedIntentSlugs: ["stoit-li-idti-dalshe", "budet-li-povyshenie", "chto-delat-dalshe"],
  },
  {
    slug: "luna-i-zvezda",
    title: "Луна и Звезда",
    cards: ["Луна", "Звезда"],
    general: "Из тумана к надежде — путь через неопределённость к исцелению.",
    love: "После сомнений приходит ясность и облегчение.",
    money: "Неясность постепенно рассеивается — держите курс.",
    advice: "Не теряйте веру в середине пути.",
    relatedIntentSlugs: ["blizhayshee-budushchee", "chto-menya-zhdet", "kak-vernut-energiyu"],
  },
  {
    slug: "smert-i-bashnya",
    title: "Смерть и Башня",
    cards: ["Смерть", "Башня"],
    general: "Мощная трансформация — старое должно уйти резко и окончательно.",
    love: "Резкие перемены в отношениях. Честность важнее комфорта.",
    money: "Кризис может перестроить финансовую модель.",
    advice: "Отпустите то, что уже не живо.",
    relatedIntentSlugs: ["pauza-ili-konec", "kak-otpustit-cheloveka", "chto-otpustit"],
  },
  {
    slug: "ierofant-i-imperator",
    title: "Иерофант и Император",
    cards: ["Иерофант", "Император"],
    general: "Традиция и власть — опора на проверенные структуры.",
    love: "Серьёзные намерения, стабильность, возможный разговор о будущем.",
    money: "Надёжные партнёрства и формальные договорённости.",
    advice: "Стройте на фундаменте, а не на импульсе.",
    relatedIntentSlugs: ["perspektiva-otnosheniy", "na-biznes", "stoit-li-vkladyvat"],
  },
  {
    slug: "shut-i-mir",
    title: "Шут и Мир",
    cards: ["Шут", "Мир"],
    general: "Новый цикл после завершения — свобода и целостность.",
    love: "Свежий старт без груза прошлого.",
    money: "Новый проект или направление после закрытия главы.",
    advice: "Сделайте первый лёгкий шаг в новое.",
    relatedIntentSlugs: ["kogda-ya-vstrechu-lyubov", "novyy-istochnik-dohoda", "blizhayshee-budushchee"],
  },
  {
    slug: "poveshennyy-i-otshelnik",
    title: "Повешенный и Отшельник",
    cards: ["Повешенный", "Отшельник"],
    general: "Время паузы и внутреннего поиска.",
    love: "Не торопите события — дайте ситуации созреть.",
    money: "Лучше подождать, чем принять поспешное решение.",
    advice: "Тишина сейчас продуктивнее действия.",
    relatedIntentSlugs: ["zhdat-ili-zabyt", "pochemu-on-molchit", "chto-delat-dalshe"],
  },
  {
    slug: "sud-i-zvezda",
    title: "Суд и Звезда",
    cards: ["Суд", "Звезда"],
    general: "Пробуждение и надежда — второй шанс и исцеление.",
    love: "Возможность возродить связь или открыть сердце заново.",
    money: "Второй шанс в проекте или карьере.",
    advice: "Ответьте на зов — не игнорируйте знак.",
    relatedIntentSlugs: ["vernyotsya-li-on", "blizhayshee-budushchee", "moyo-prednaznachenie"],
  },
  {
    slug: "dyavol-i-bashnya",
    title: "Дьявол и Башня",
    cards: ["Дьявол", "Башня"],
    general: "Разрушение цепей — освобождение от того, что держало.",
    love: "Кризис может разорвать токсичную связь.",
    money: "Разрыв невыгодной сделки или зависимости от дохода.",
    advice: "После шока приходит свобода — примите её.",
    relatedIntentSlugs: ["est-li-u-nego-drugaya", "kak-otpustit-cheloveka", "denezhnyy-blok"],
  },
  {
    slug: "imperatritsa-i-luna",
    title: "Императрица и Луна",
    cards: ["Императрица", "Луна"],
    general: "Плодородие и тайна — рост в условиях неопределённости.",
    love: "Чувства глубоки, но не всё сказано вслух. Доверяйте интуиции.",
    money: "Потенциал есть, но детали пока скрыты.",
    advice: "Питайте процесс, не требуйте мгновенной ясности.",
    relatedIntentSlugs: ["chto-on-chuvstvuet", "chto-on-skryvaet", "moy-potentsial"],
  },
];

const BY_SLUG = new Map(CARD_COMBINATIONS.map((c) => [c.slug, c]));

export function getCardCombinationBySlug(slug: string): CardCombinationDefinition | undefined {
  return BY_SLUG.get(slug);
}

export function getAllCardCombinations(): CardCombinationDefinition[] {
  return CARD_COMBINATIONS;
}

export function generateCombinationStaticParams(): { slug: string }[] {
  return CARD_COMBINATIONS.map((c) => ({ slug: c.slug }));
}
