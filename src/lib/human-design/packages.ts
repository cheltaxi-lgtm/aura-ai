import type { RuneActionType } from "@/lib/rune-costs";

/** Paid / free report tiers for the Human Design product showcase. */
export type HdReportPackageId = "foundation" | "depth" | "max";

export interface HdReportModule {
  id: string;
  title: string;
  blurb: string;
}

export interface HdReportPackage {
  id: HdReportPackageId;
  label: string;
  tagline: string;
  /** Rune action to charge; null = free deterministic brief. */
  action: RuneActionType | null;
  /** Included follow-up asks after purchase (Max). */
  includedAsks: number;
  /** Highlight as the recommended / full tier. */
  featured?: boolean;
  modules: readonly HdReportModule[];
}

const MODULE = {
  type: {
    id: "type",
    title: "Тип и стратегия",
    blurb: "Как правильно входить в дела и отношения",
  },
  authority: {
    id: "authority",
    title: "Внутренний авторитет",
    blurb: "Как принимать решения без чужого давления",
  },
  notSelf: {
    id: "not-self",
    title: "Ложное «я» и подпись",
    blurb: "Сигналы, что вы сошли с пути — и что значит «на месте»",
  },
  profile: {
    id: "profile",
    title: "Профиль",
    blurb: "Роль в жизни и паттерны поведения",
  },
  centers: {
    id: "centers",
    title: "9 центров",
    blurb: "Где вы устойчивы и где открыты влиянию",
  },
  definition: {
    id: "definition",
    title: "Определённость",
    blurb: "Самодостаточность и потребность в других",
  },
  channels: {
    id: "channels",
    title: "Каналы",
    blurb: "Сильные стороны и как ими пользоваться",
  },
  planets: {
    id: "planets",
    title: "Планеты и узлы",
    blurb: "Сознательное / бессознательное и жизненная траектория",
  },
  cross: {
    id: "cross",
    title: "Инкарнационный крест",
    blurb: "Тема вклада и направления жизни",
  },
  life: {
    id: "life",
    title: "Работа и отношения",
    blurb: "Как энергия проявляется в деле и близости",
  },
  sleep: {
    id: "sleep",
    title: "Сон и восстановление",
    blurb: "Ритм отдыха под вашу механику",
  },
  perception: {
    id: "perception",
    title: "Как вас считывают",
    blurb: "Первое впечатление и скрытые козыри",
  },
  practices: {
    id: "practices",
    title: "Практики",
    blurb: "Конкретные шаги на ближайшие дни",
  },
  asks: {
    id: "asks",
    title: "Вопросы Эвелине",
    blurb: "Уточнения по разбору без доплаты",
  },
} as const satisfies Record<string, HdReportModule>;

export const HD_REPORT_PACKAGES: readonly HdReportPackage[] = [
  {
    id: "foundation",
    label: "Опора",
    tagline: "Базовая механика карты — сразу и бесплатно",
    action: null,
    includedAsks: 0,
    modules: [
      MODULE.type,
      MODULE.authority,
      MODULE.notSelf,
      MODULE.profile,
      MODULE.centers,
    ],
  },
  {
    id: "depth",
    label: "Глубина",
    tagline: "Модульный разбор от Эвелины",
    action: "HD_REPORT",
    includedAsks: 0,
    modules: [
      MODULE.type,
      MODULE.authority,
      MODULE.notSelf,
      MODULE.profile,
      MODULE.definition,
      MODULE.centers,
      MODULE.channels,
      MODULE.planets,
      MODULE.cross,
      MODULE.life,
      MODULE.practices,
    ],
  },
  {
    id: "max",
    label: "Макс",
    tagline: "Полная глубина + сон, восприятие и вопросы",
    action: "HD_REPORT_MAX",
    includedAsks: 3,
    featured: true,
    modules: [
      MODULE.type,
      MODULE.authority,
      MODULE.notSelf,
      MODULE.profile,
      MODULE.definition,
      MODULE.centers,
      MODULE.channels,
      MODULE.planets,
      MODULE.cross,
      MODULE.life,
      MODULE.sleep,
      MODULE.perception,
      MODULE.practices,
      MODULE.asks,
    ],
  },
] as const;

export function hdReportPackageById(id: string | null | undefined): HdReportPackage | null {
  if (!id) return null;
  return HD_REPORT_PACKAGES.find((p) => p.id === id) ?? null;
}

export function isPaidHdReportPackage(
  id: string | null | undefined
): id is Exclude<HdReportPackageId, "foundation"> {
  return id === "depth" || id === "max";
}

/** Connection Chart paid report — single premium SKU with a module checklist. */
export const HD_CONNECTION_REPORT_MODULES: readonly HdReportModule[] = [
  {
    id: "chemistry",
    title: "Химия связи",
    blurb: "Электромагнетика и притяжение в вашей паре",
  },
  {
    id: "boost",
    title: "Как усиливаете друг друга",
    blurb: "Где один стабилизирует и раскрывает другого",
  },
  {
    id: "electro",
    title: "Электромагнетика",
    blurb: "Каналы «половинка + половинка» по отдельности",
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
    id: "practices",
    title: "Практики",
    blurb: "Шаги на 7 и 30 дней под сценарий связи",
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
        claims: paras.map((text) => ({ text })),
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
      claims: (paras.length ? paras : [title]).map((text) => ({ text })),
    });
  });

  return sections;
}
