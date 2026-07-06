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

export const FORECAST_YEARS = [2026] as const;

export function getForecastMonthBySlug(slug: string): ForecastMonth | undefined {
  return FORECAST_MONTHS.find((m) => m.slug === slug);
}

export function getCurrentForecastMonth(date = new Date()): ForecastMonth {
  return FORECAST_MONTHS[date.getMonth()]!;
}

export function getCurrentForecastYear(date = new Date()): number {
  return date.getFullYear();
}

export function getYearForecastMeta(year: number) {
  return {
    title: `Таро прогноз на ${year} год — расклад по месяцам | Zovus`,
    description: `Прогноз Таро на ${year} год: расклад по месяцам, советы карт на любовь, финансы и саморазвитие. Актуальный годовой обзор — онлайн на Zovus.`,
    h1: `Таро прогноз на ${year} год`,
    path: `/prognoz/${year}`,
  };
}

export function getMonthForecastMeta(year: number, month: ForecastMonth) {
  return {
    title: `Таро на ${month.name} ${year} — прогноз и расклад | Zovus`,
    description: `Таро на ${month.name} ${year}: прогноз по картам на любовь, работу и ключевые события. Актуальный месячный расклад с трактовкой — онлайн на Zovus.`,
    h1: `Таро на ${month.name} ${year}: прогноз по картам`,
    path: `/prognoz/${year}/${month.slug}`,
  };
}

export function getZodiacSignForecastMeta(
  signName: string,
  signSlug: string,
  year: number,
  month?: ForecastMonth
) {
  if (month) {
    return {
      title: `Таро ${signName} — прогноз на ${month.name} ${year} | Zovus`,
      description: `Таро для ${signName}: прогноз на ${month.name} ${year} по картам. Любовь, карьера и совет арканов для знака ${signName} — персональный расклад на Zovus.`,
      h1: `Таро для ${signName}: прогноз на ${month.name} ${year}`,
      path: `/prognoz/znak/${signSlug}/${month.slug}`,
    };
  }
  return {
    title: `Таро ${signName} ${year} — прогноз по знаку | Zovus`,
    description: `Таро для ${signName} на ${year} год: прогноз по месяцам, любовь и карьера. Расклады по знаку ${signName} с трактовкой мастера — на Zovus.`,
    h1: `Таро для ${signName}: прогноз на ${year} год`,
    path: `/prognoz/znak/${signSlug}`,
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

export function getZodiacMonthInsight(signName: string, month: ForecastMonth): string {
  return `Для ${signName} в ${month.namePrepositional} карты подчёркивают ${getMonthForecastThemes(month).join(", ")}. Расклад поможет увидеть, где знак получает поддержку арканов, а где стоит проявить осознанность.`;
}
