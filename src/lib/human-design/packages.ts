/** Module checklist for the single full HD personal report (one purchase). */
export interface HdReportModule {
  id: string;
  title: string;
  blurb: string;
}

/**
 * Exact ## titles the model must produce (competitive full-decrypt coverage).
 * Order matches the system prompt.
 */
export const HD_REPORT_REQUIRED_SECTIONS = [
  "Тип и его особенности",
  "Стратегия",
  "Авторитет",
  "Ложное «я»",
  "Подпись",
  "Профиль",
  "Девять центров",
  "Определённость и самодостаточность",
  "Каналы",
  "Планеты и узлы",
  "Как вы себя видите",
  "Автоматические реакции",
  "Бизнес и работа",
  "Инкарнационный крест",
  "Переменные и среда",
  "Скрытые разделы карты",
  "Сон и восстановление",
  "Отношения",
  "Периоды и темы жизни",
  "Практики на 7 дней",
  "Практики на 30 дней",
] as const;

/** Everything included in one paid personal report (showcase + parity with full decrypt). */
export const HD_FULL_REPORT_MODULES: readonly HdReportModule[] = [
  {
    id: "type",
    title: "Тип и его особенности",
    blurb: "Работа, развитие, отношения, энергия — как устроена ваша природа",
  },
  {
    id: "strategy",
    title: "Стратегия",
    blurb: "Когда действовать и когда ждать",
  },
  {
    id: "authority",
    title: "Внутренний авторитет",
    blurb: "Как принимать верные решения",
  },
  {
    id: "not-self",
    title: "Ложное «я»",
    blurb: "Почему всё идёт не так, даже когда «делаешь правильно»",
  },
  {
    id: "signature",
    title: "Подпись",
    blurb: "Ощущение, что вы на своём месте",
  },
  {
    id: "profile",
    title: "Профиль",
    blurb: "Лёгкие роли и зоны самоборьбы",
  },
  {
    id: "centers",
    title: "9 центров",
    blurb: "Где вы влияете и где открыты",
  },
  {
    id: "definition",
    title: "Самодостаточность",
    blurb: "Насколько вам нужны другие люди",
  },
  {
    id: "channels",
    title: "Разбор каналов",
    blurb: "Главные преимущества и как ими пользоваться",
  },
  {
    id: "planets",
    title: "Планеты и узлы",
    blurb: "Что двигает характер и направление жизни",
  },
  {
    id: "self-view",
    title: "Как вы себя видите",
    blurb: "Что недооцениваете и что есть на самом деле",
  },
  {
    id: "reactions",
    title: "Автоматические реакции",
    blurb: "Что видят другие, а вы — нет (скрытые козыри)",
  },
  {
    id: "business",
    title: "Бизнес и работа",
    blurb: "Стиль работы и подходящие направления",
  },
  {
    id: "cross",
    title: "Инкарнационный крест",
    blurb: "Смысл вклада и польза для мира",
  },
  {
    id: "variables",
    title: "Переменные и среда",
    blurb: "Познание, среда, color/tone/base",
  },
  {
    id: "hidden",
    title: "Скрытые разделы карты",
    blurb: "Висящие ворота, дизайн vs личность",
  },
  {
    id: "sleep",
    title: "Сон и восстановление",
    blurb: "Как отдыхать под вашу механику",
  },
  {
    id: "relations",
    title: "Отношения",
    blurb: "Близость, границы, динамика с другими",
  },
  {
    id: "periods",
    title: "Периоды и темы жизни",
    blurb: "Фазы по профилю и кресту — без выдуманных дат",
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
  // Accept "## Title" and "##Title"; keep body newlines intact (do not explode lists).
  const chunks = withoutDisclaimer.split(/^##\s*/m);
  const sections: Array<{ key: string; title: string; claims: Array<{ text: string }> }> = [];
  const startsWithHeading = /^##\s*\S/.test(withoutDisclaimer);

  chunks.forEach((chunk, index) => {
    const trimmed = chunk.trim();
    if (!trimmed) return;
    if (index === 0 && !startsWithHeading) {
      sections.push({
        key: "intro",
        title: "Вступление",
        claims: [{ text: trimmed }],
      });
      return;
    }
    const nl = trimmed.indexOf("\n");
    const title = (nl === -1 ? trimmed : trimmed.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : trimmed.slice(nl + 1)).trim();
    if (!title) return;
    sections.push({
      key: `s-${sections.length}-${title.slice(0, 24).replace(/\s+/g, "-").toLowerCase()}`,
      title,
      claims: [{ text: body || title }],
    });
  });

  return sections;
}

/** @deprecated kept for type imports; personal report is always full. */
export type HdReportPackageId = "foundation" | "full";
