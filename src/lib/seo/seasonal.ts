import type { SeoZodiacSign } from "@/lib/seo/zodiac-signs";

export type ForecastMonth = {
  slug: string;
  name: string;
  nameGenitive: string;
  namePrepositional: string;
};

export const FORECAST_MONTHS: ForecastMonth[] = [
  { slug: "yanvar", name: "январь", nameGenitive: "января", namePrepositional: "январе" },
  { slug: "fevral", name: "февраль", nameGenitive: "февраля", namePrepositional: "феврале" },
  { slug: "mart", name: "март", nameGenitive: "марта", namePrepositional: "марте" },
  { slug: "aprel", name: "апрель", nameGenitive: "апреля", namePrepositional: "апреле" },
  { slug: "may", name: "май", nameGenitive: "мая", namePrepositional: "мае" },
  { slug: "iyun", name: "июнь", nameGenitive: "июня", namePrepositional: "июне" },
  { slug: "iyul", name: "июль", nameGenitive: "июля", namePrepositional: "июле" },
  { slug: "avgust", name: "август", nameGenitive: "августа", namePrepositional: "августе" },
  { slug: "sentyabr", name: "сентябрь", nameGenitive: "сентября", namePrepositional: "сентябре" },
  { slug: "oktyabr", name: "октябрь", nameGenitive: "октября", namePrepositional: "октябре" },
  { slug: "noyabr", name: "ноябрь", nameGenitive: "ноября", namePrepositional: "ноябре" },
  { slug: "dekabr", name: "декабрь", nameGenitive: "декабря", namePrepositional: "декабре" },
];

/** Keep historic 2026 pages accessible while adding the current and next year. */
export function getForecastYears(now = new Date()): number[] {
  const lastYear = Math.max(2027, now.getUTCFullYear() + 1);
  return Array.from({ length: lastYear - 2025 }, (_, index) => 2026 + index);
}

export function getForecastMonthBySlug(slug: string): ForecastMonth | undefined {
  return FORECAST_MONTHS.find((m) => m.slug === slug);
}

export function getCurrentForecastMonth(date = new Date()): ForecastMonth {
  return FORECAST_MONTHS[date.getUTCMonth()]!;
}

export function getCurrentForecastYear(date = new Date()): number {
  return date.getUTCFullYear();
}

export function isPastForecastMonth(year: number, month: ForecastMonth, now = new Date()): boolean {
  const monthIndex = FORECAST_MONTHS.findIndex((item) => item.slug === month.slug);
  return year < now.getUTCFullYear() ||
    (year === now.getUTCFullYear() && monthIndex < now.getUTCMonth());
}

export function getYearForecastMeta(year: number, now = new Date()) {
  return {
    title: `Таро на ${year} год — как составить личный прогноз | Zovus`,
    description: `Как составить личный прогноз Таро на ${year} год: вопросы по месяцам, схема расклада и способ сверять выводы с реальными событиями.`,
    h1: `Таро на ${year} год: личный прогноз по месяцам`,
    path: `/prognoz/${year}`,
    noIndex: year < getCurrentForecastYear(now),
  };
}

export function getMonthForecastMeta(year: number, month: ForecastMonth, now = new Date()) {
  return {
    title: `Таро на ${month.name} ${year} — вопросы для расклада | Zovus`,
    description: `Таро на ${month.name} ${year}: какие вопросы задать о планах, отношениях и работе и как прочитать личный расклад на месяц.`,
    h1: `Таро на ${month.name} ${year}: вопросы для прогноза`,
    path: `/prognoz/${year}/${month.slug}`,
    noIndex: isPastForecastMonth(year, month, now),
  };
}

export function getZodiacSignForecastMeta(
  sign: SeoZodiacSign,
  year: number,
  month?: ForecastMonth,
  now = new Date()
) {
  if (month) {
    return {
      title: `Таро для ${sign.nameGenitive} на ${month.name} ${year} | Zovus`,
      description: `Вопросы для личного расклада Таро на ${month.name} ${year} для ${sign.nameGenitive}: как связать карты с решением, не полагаясь на один знак зодиака.`,
      h1: `Таро для ${sign.nameGenitive}: ${month.name} ${year}`,
      path: `/prognoz/znak/${sign.slug}/${month.slug}`,
      noIndex: isPastForecastMonth(year, month, now),
    };
  }
  return {
    title: `Таро для ${sign.nameGenitive} на ${year} год | Zovus`,
    description: `Как составить личный прогноз Таро на ${year} год для ${sign.nameGenitive}: пример вопроса, чтение карт и переход к раскладу по месяцам.`,
    h1: `Таро для ${sign.nameGenitive}: прогноз на ${year} год`,
    path: `/prognoz/znak/${sign.slug}`,
  };
}

export function getMonthForecastThemes(month: ForecastMonth): string[] {
  const themes: Record<string, string[]> = {
    yanvar: ["новые начинания", "планы на год", "внутренняя опора"],
    fevral: ["отношения", "выбор приоритетов", "терпение"],
    mart: ["активные шаги", "карьера", "пробуждение энергии"],
    aprel: ["любовь", "гармония", "творчество"],
    may: ["расширение", "общение", "радость"],
    iyun: ["баланс", "семья", "адаптация"],
    iyul: ["отдых и ясность", "отношения", "перезагрузка"],
    avgust: ["результаты", "уверенность", "материальная сфера"],
    sentyabr: ["структура", "обучение", "новый ритм"],
    oktyabr: ["глубина", "решения", "трансформация"],
    noyabr: ["благодарность", "итоги", "подготовка к зиме"],
    dekabr: ["завершение цикла", "надежда", "планы на будущее"],
  };
  return themes[month.slug] ?? ["любовь", "работа", "личный рост"];
}

export function getZodiacMonthInsight(sign: SeoZodiacSign, month: ForecastMonth): string {
  return `Для ${sign.nameGenitive} в ${month.namePrepositional} можно поставить вопрос по теме «${getMonthForecastThemes(month)[0]}» и связать её со своей ситуацией. Один знак не определяет события месяца: ответ зависит от выпавших карт и вашего контекста.`;
}
