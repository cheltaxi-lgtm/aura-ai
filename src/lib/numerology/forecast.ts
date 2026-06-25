import { personalYear, type NumerologyResult } from "./calculator";
import { buildNumerologyResult } from "./constants";

export interface PersonalYearForecastEntry {
  year: number;
  number: number;
  theme: string;
  advice: string;
}

const YEAR_THEMES: Record<number, { theme: string; advice: string }> = {
  1: {
    theme: "Новый цикл, старт, личная инициатива",
    advice: "Смело начинайте проекты, закладывайте фундамент на 9 лет вперёд.",
  },
  2: {
    theme: "Партнёрство, терпение, дипломатия",
    advice: "Стройте союзы, не форсируйте — созревание важнее скорости.",
  },
  3: {
    theme: "Творчество, общение, радость",
    advice: "Выражайте себя, учитесь, делитесь — это год видимости.",
  },
  4: {
    theme: "Труд, порядок, дисциплина",
    advice: "Укрепляйте систему, завершайте начатое, берегите здоровье.",
  },
  5: {
    theme: "Перемены, свобода, новый опыт",
    advice: "Будьте гибкими — неожиданные повороты ведут к росту.",
  },
  6: {
    theme: "Семья, дом, ответственность",
    advice: "Инвестируйте в близких, гармонизируйте отношения и быт.",
  },
  7: {
    theme: "Анализ, духовность, уединение",
    advice: "Углубляйтесь в знания, пересмотрите приоритеты, отдыхайте душой.",
  },
  8: {
    theme: "Деньги, власть, результат",
    advice: "Действуйте смело в материальной сфере, берите ответственность.",
  },
  9: {
    theme: "Завершение, отпускание, итоги",
    advice: "Закрывайте циклы, прощайте, готовьтесь к новому личному году 1.",
  },
  11: {
    theme: "Интуиция, вдохновение, духовный рост",
    advice: "Доверяйте знакам, не бойтесь масштаба мечты.",
  },
  22: {
    theme: "Великие проекты, реализация мечты",
    advice: "Стройте долгосрочно — малое сейчас не удовлетворит.",
  },
  33: {
    theme: "Служение, наставничество, сострадание",
    advice: "Делитесь мудростью, исцеляйте через пример и поддержку.",
  },
};

export function personalYearForecast(
  birthDate: string,
  fromYear?: number,
  years = 9
): PersonalYearForecastEntry[] {
  const start = fromYear ?? new Date().getFullYear();
  const out: PersonalYearForecastEntry[] = [];

  for (let i = 0; i < years; i++) {
    const year = start + i;
    const result: NumerologyResult = personalYear(birthDate, year);
    const meta = YEAR_THEMES[result.number] ?? {
      theme: `Вибрация ${result.number}`,
      advice: result.meaning,
    };
    out.push({
      year,
      number: result.number,
      theme: meta.theme,
      advice: meta.advice,
    });
  }

  return out;
}

export function personalYearTheme(number: number): string {
  return YEAR_THEMES[number]?.theme ?? buildNumerologyResult(number).title;
}
