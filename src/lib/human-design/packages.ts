/** Module checklist for the single full HD personal report (one purchase). */
export interface HdReportModule {
  id: string;
  title: string;
  blurb: string;
}

/** Everything included in one paid personal report. */
export const HD_FULL_REPORT_MODULES: readonly HdReportModule[] = [
  {
    id: "type",
    title: "Тип и стратегия",
    blurb: "Как правильно входить в дела и отношения",
  },
  {
    id: "authority",
    title: "Внутренний авторитет",
    blurb: "Как принимать решения без чужого давления",
  },
  {
    id: "not-self",
    title: "Ложное «я» и подпись",
    blurb: "Сигналы схода с пути и ощущение «на месте»",
  },
  {
    id: "profile",
    title: "Профиль",
    blurb: "Роль в жизни и паттерны поведения",
  },
  {
    id: "definition",
    title: "Определённость",
    blurb: "Самодостаточность и потребность в других",
  },
  {
    id: "centers",
    title: "9 центров",
    blurb: "Где вы устойчивы и где открыты влиянию",
  },
  {
    id: "channels",
    title: "Каналы",
    blurb: "Сильные стороны и как ими пользоваться",
  },
  {
    id: "planets",
    title: "Планеты и узлы",
    blurb: "Сознательное / бессознательное и траектория",
  },
  {
    id: "cross",
    title: "Инкарнационный крест",
    blurb: "Тема вклада и направления жизни",
  },
  {
    id: "variables",
    title: "Переменные и среда",
    blurb: "Познание, среда и color/tone/base по Солнцу",
  },
  {
    id: "life",
    title: "Работа и отношения",
    blurb: "Как энергия проявляется в деле и близости",
  },
  {
    id: "sleep",
    title: "Сон и восстановление",
    blurb: "Ритм отдыха под центры и среду",
  },
  {
    id: "perception",
    title: "Как вас считывают",
    blurb: "Первое впечатление и скрытые козыри",
  },
  {
    id: "practices",
    title: "Практики 7 и 30 дней",
    blurb: "Конкретные шаги после разбора",
  },
  {
    id: "asks",
    title: "5 вопросов Эвелине",
    blurb: "Уточнения по разбору без доплаты",
  },
  {
    id: "pdf",
    title: "Премиальный PDF",
    blurb: "Печатный отчёт с оглавлением и данными карты",
  },
] as const;

/** Connection Chart paid report — single premium SKU. */
export const HD_CONNECTION_REPORT_MODULES: readonly HdReportModule[] = [
  {
    id: "chemistry",
    title: "Химия связи",
    blurb: "Электромагнетика и притяжение",
  },
  {
    id: "boost",
    title: "Как усиливаете друг друга",
    blurb: "Где один стабилизирует и раскрывает другого",
  },
  {
    id: "electro",
    title: "Электромагнетика",
    blurb: "Каналы «половинка + половинка»",
  },
  {
    id: "harmony",
    title: "Опоры",
    blurb: "Общие центры и устойчивые совпадения",
  },
  {
    id: "friction",
    title: "Трение",
    blurb: "Зоны притирки без драматизации",
  },
  {
    id: "decisions",
    title: "Решения вместе",
    blurb: "Стратегии и авторитеты в паре",
  },
  {
    id: "daily",
    title: "Быт и близость",
    blurb: "Живая динамика в выбранном сценарии",
  },
  {
    id: "practices",
    title: "Практики 7 и 30 дней",
    blurb: "Шаги под сценарий связи",
  },
] as const;

/**
 * Split sanitized markdown report into print sections (## headings).
 * Intro before the first ## becomes «Вступление».
 */
export function hdReportTextToPrintSections(
  text: string
): Array<{ key: string; title: string; claims: Array<{ text: string }> }> {
  const cleaned = text.replace(/\r\n/g, "\n").trim();
  const withoutDisclaimer = cleaned
    .replace(/\n*---\n+\*?Разбор является[\s\S]*$/i, "")
    .trim();
  const chunks = withoutDisclaimer.split(/^## /m);
  const sections: Array<{ key: string; title: string; claims: Array<{ text: string }> }> = [];

  chunks.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    if (index === 0 && !withoutDisclaimer.startsWith("## ")) {
      const paras = trimmed.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      if (!paras.length) return;
      sections.push({
        key: "intro",
        title: "Вступление",
        claims: paras.map((t) => ({ text: t })),
      });
      return;
    }
    const nl = trimmed.indexOf("\n");
    const title = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : trimmed.slice(nl + 1)).trim();
    if (!title) return;
    const paras = body
      ? body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
      : [];
    sections.push({
      key: `s-${sections.length}-${title.slice(0, 24).replace(/\s+/g, "-").toLowerCase()}`,
      title,
      claims: (paras.length ? paras : [title]).map((t) => ({ text: t })),
    });
  });

  return sections;
}

/** @deprecated kept for type imports; personal report is always full. */
export type HdReportPackageId = "foundation" | "full";
