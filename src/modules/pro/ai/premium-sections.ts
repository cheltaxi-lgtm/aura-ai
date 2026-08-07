import type { ProCaseType, ProReportBlock } from "../domain/types";

export type PremiumSection = {
  id: string;
  title: string;
  /** Target words per block (A4 ~450–500 words/page). */
  targetWords: number;
  hint: string;
};

const WONT = `
Запрещено:
- предсказывать конкретные события, даты «когда случится», гарантии исхода;
- проклятия, порчу, диагнозы, медицинские и финансовые советы;
- пустые общие фразы про «знак зодиака» без привязки к фактам карты;
- обещать исцеление или изменение судьбы.
Можно: разбирать характер, паттерны, сильные/слабые зоны с жизненными примерами; мягко формулировать неопределённость при неизвестном времени рождения.
`.trim();

export const PREMIUM_SECTIONS: Record<"natal" | "matrix" | "hd", PremiumSection[]> = {
  natal: [
    {
      id: "n1",
      title: "Портрет по карте",
      targetWords: 400,
      hint: "Введение: big three, общий тон личности, на что опираться в разборе.",
    },
    {
      id: "n2",
      title: "Солнце, Луна, Асцендент",
      targetWords: 450,
      hint: "Глубокий разбор светил и ASC с примерами поведения.",
    },
    {
      id: "n3",
      title: "Планеты в знаках и домах",
      targetWords: 500,
      hint: "Меркурий–Плутон: как проявляются в жизни, без общих клише.",
    },
    {
      id: "n4",
      title: "Дома и жизненные сферы",
      targetWords: 450,
      hint: "Ключевые дома: работа, отношения, ресурсы, призвание.",
    },
    {
      id: "n5",
      title: "Аспекты и динамика",
      targetWords: 400,
      hint: "Главные аспекты: напряжение и поддержка, как с этим жить.",
    },
    {
      id: "n6",
      title: "Сильные стороны и зоны роста",
      targetWords: 400,
      hint: "Практичные опоры и слепые зоны с примерами.",
    },
    {
      id: "n7",
      title: "Отношения и самореализация",
      targetWords: 400,
      hint: "Как человек строит близость и проявляет потенциал.",
    },
    {
      id: "n8",
      title: "Итог и бережные рекомендации",
      targetWords: 300,
      hint: "Сводка без прогнозов событий; 3–5 мягких ориентиров.",
    },
  ],
  matrix: [
    {
      id: "m1",
      title: "Обзор матрицы",
      targetWords: 350,
      hint: "Ключевые энергии и фокус матрицы.",
    },
    {
      id: "m2",
      title: "Центр силы и комфорт",
      targetWords: 400,
      hint: "Comfort/purpose: где человек наполняется.",
    },
    {
      id: "m3",
      title: "Линии рода",
      targetWords: 400,
      hint: "Отцовская/материнская линии, наследие и задачи.",
    },
    {
      id: "m4",
      title: "Кармический хвост и земля",
      targetWords: 400,
      hint: "Хвост и земная задача — паттерны, не проклятия.",
    },
    {
      id: "m5",
      title: "Каналы денег, любви, небо–земля",
      targetWords: 450,
      hint: "Как энергии каналов проявляются в быту и отношениях.",
    },
    {
      id: "m6",
      title: "Возрастной пояс и период",
      targetWords: 350,
      hint: "Текущий и ближайший возрастной акцент.",
    },
    {
      id: "m7",
      title: "Зоны роста и итог",
      targetWords: 350,
      hint: "Практичные опоры без гарантий и запугивания.",
    },
  ],
  hd: [
    {
      id: "h1",
      title: "Тип и стратегия",
      targetWords: 400,
      hint: "Тип, стратегия, подпись и ложное «я» с примерами.",
    },
    {
      id: "h2",
      title: "Авторитет",
      targetWords: 400,
      hint: "Как принимать решения по авторитету.",
    },
    {
      id: "h3",
      title: "Профиль и крест",
      targetWords: 400,
      hint: "Профиль и инкарнационный крест — роль, не судьба-приговор.",
    },
    {
      id: "h4",
      title: "Центры",
      targetWords: 450,
      hint: "Определённые и открытые центры: мудрость и уязвимости.",
    },
    {
      id: "h5",
      title: "Каналы и ворота",
      targetWords: 450,
      hint: "Ключевые каналы и активации личности/дизайна.",
    },
    {
      id: "h6",
      title: "Отношения и работа с энергией",
      targetWords: 350,
      hint: "Как тип проявляется с людьми и в деле.",
    },
    {
      id: "h7",
      title: "Итог",
      targetWords: 300,
      hint: "Сводка и бережные ориентиры; учесть нестабильность при неизвестном времени.",
    },
  ],
};

export function sectionsForType(type: ProCaseType): PremiumSection[] | null {
  if (type === "natal" || type === "matrix" || type === "hd") {
    return PREMIUM_SECTIONS[type];
  }
  return null;
}

export function stubPremiumBlocks(
  type: "natal" | "matrix" | "hd",
  clientAlias: string
): ProReportBlock[] {
  return PREMIUM_SECTIONS[type].map((s, i) => ({
    id: s.id,
    title: s.title,
    body: `Раздел «${s.title}» для ${clientAlias}. Черновик ожидает PRO_AI_ENABLED или ручного заполнения. Ориентир объёма: ~${s.targetWords} слов. ${s.hint}`,
    ai_confidence: 0.35,
    position_ref: String(i + 1),
  }));
}

export function buildPremiumSystemPrompt(
  type: "natal" | "matrix" | "hd",
  addressForm: string | undefined,
  batch: PremiumSection[]
): string {
  const you = addressForm === "ty" ? "на ты" : "на вы";
  const total = batch.reduce((s, b) => s + b.targetWords, 0);
  const sectionSpec = batch
    .map(
      (s) =>
        `- id="${s.id}" title="${s.title}" (~${s.targetWords} слов): ${s.hint}`
    )
    .join("\n");

  return `Ты пишешь премиум-отчёт для клиента практикующего в Zovus Pro (тип: ${type}).
Обращение: ${you}. Язык: русский.
Верни СТРОГО JSON:
{"blocks":[{"id":"...","title":"...","body":"...","ai_confidence":0.0}],"uncertainty":[{"blockId":"...","note":"..."}]}
Нужны блоки РОВНО с этими id (порядок сохрани):
${sectionSpec}
Суммарный объём этой партии ≈ ${total} слов. Пиши развёрнуто, с жизненными примерами, опираясь ТОЛЬКО на факты карты из user message (evidenceText).
${WONT}
ai_confidence 0.3–0.85; понижай, если время рождения неизвестно или факт неоднозначен.`;
}

/** Split sections into two LLM batches to hit page volume without one huge call. */
export function batchSections(sections: PremiumSection[]): PremiumSection[][] {
  if (sections.length <= 4) return [sections];
  const mid = Math.ceil(sections.length / 2);
  return [sections.slice(0, mid), sections.slice(mid)];
}
