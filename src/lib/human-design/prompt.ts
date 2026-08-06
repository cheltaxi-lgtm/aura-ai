import type { HdChart } from "./types";
import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  CROSS_ANGLE_NAMES_RU,
  CROSS_NAMES_RU,
  DEFINITION_NAMES_RU,
  GATE_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "./constants";

const BODY_NAMES_RU: Record<string, string> = {
  sun: "Солнце",
  earth: "Земля",
  moon: "Луна",
  northNode: "Северный узел",
  southNode: "Южный узел",
  mercury: "Меркурий",
  venus: "Венера",
  mars: "Марс",
  jupiter: "Юпитер",
  saturn: "Сатурн",
  uranus: "Уран",
  neptune: "Нептун",
  pluto: "Плутон",
};

function crossNameRu(chart: HdChart): string {
  const names = CROSS_NAMES_RU[chart.cross.gates[0]];
  if (!names) return chart.cross.nameEn;
  const index = chart.cross.angle === "right" ? 0 : chart.cross.angle === "juxtaposition" ? 1 : 2;
  return names[index] ?? chart.cross.nameEn;
}

/** One-line digest for durable memory facts. */
export function formatHdFactLine(chart: HdChart): string {
  const typeMeta = TYPE_META[chart.type];
  const profileName = PROFILE_NAMES_RU[chart.profile] ?? chart.profile;
  const definition = DEFINITION_NAMES_RU[chart.definition] ?? chart.definition;
  return (
    `Дизайн Человека клиента: тип «${typeMeta.nameRu}» (стратегия — ${typeMeta.strategyRu}), ` +
    `авторитет — ${AUTHORITY_NAMES_RU[chart.authority]}, профиль ${chart.profile} «${profileName}», ` +
    `определённость — ${definition}, инкарнационный крест «${crossNameRu(chart)}» ` +
    `(${CROSS_ANGLE_NAMES_RU[chart.cross.angle]}, ворота ${chart.cross.gates.join("/")}).`
  );
}

/** Compact chat-context block (masters other than the HD report chat). */
export function formatHdChatSummary(chart: HdChart): string {
  const typeMeta = TYPE_META[chart.type];
  const lines: string[] = [];
  lines.push(`Тип: ${typeMeta.nameRu} — стратегия «${typeMeta.strategyRu}»`);
  lines.push(`Авторитет: ${AUTHORITY_NAMES_RU[chart.authority]}`);
  lines.push(
    `Профиль: ${chart.profile} — ${PROFILE_NAMES_RU[chart.profile] ?? chart.profile}`
  );
  lines.push(`Определённость: ${DEFINITION_NAMES_RU[chart.definition] ?? chart.definition}`);
  lines.push(
    `Инкарнационный крест: «${crossNameRu(chart)}» (${CROSS_ANGLE_NAMES_RU[chart.cross.angle]})`
  );
  lines.push(
    `Определённые центры: ${
      chart.definedCenters.length
        ? chart.definedCenters.map((c) => CENTER_NAMES_RU[c]).join(", ")
        : "нет"
    }`
  );
  if (!chart.timeKnown && chart.stability) {
    const unstable: string[] = [];
    if (!chart.stability.typeStable) unstable.push("тип");
    if (!chart.stability.authorityStable) unstable.push("авторитет");
    if (!chart.stability.profileStable) unstable.push("профиль");
    if (unstable.length) {
      lines.push(
        `Время рождения неизвестно: ${unstable.join(", ")} могут отличаться — не утверждай их категорично.`
      );
    }
  }
  return lines.join("\n");
}

/** Deterministic evidence block — the only facts the model may use. */
export function formatHdEvidence(chart: HdChart): string {
  const typeMeta = TYPE_META[chart.type];
  const lines: string[] = [];

  lines.push(`Тип: ${typeMeta.nameRu}`);
  lines.push(`Стратегия: ${typeMeta.strategyRu}`);
  lines.push(`Подпись: ${typeMeta.signatureRu}`);
  lines.push(`Тема ложного «я»: ${typeMeta.notSelfRu}`);
  lines.push(`Авторитет: ${AUTHORITY_NAMES_RU[chart.authority]}`);
  lines.push(
    `Профиль: ${chart.profile} — ${PROFILE_NAMES_RU[chart.profile] ?? chart.profile}`
  );
  lines.push(`Определённость: ${DEFINITION_NAMES_RU[chart.definition] ?? chart.definition}`);
  lines.push(
    `Инкарнационный крест: ${CROSS_ANGLE_NAMES_RU[chart.cross.angle]} — «${crossNameRu(chart)}» (ворота ${chart.cross.gates.join(", ")})`
  );

  lines.push("");
  lines.push(
    `Определённые центры (${chart.definedCenters.length}): ${
      chart.definedCenters.length
        ? chart.definedCenters.map((c) => CENTER_NAMES_RU[c]).join(", ")
        : "нет (полностью открытый бодиграф)"
    }`
  );
  const openCenters = (Object.keys(CENTER_NAMES_RU) as Array<keyof typeof CENTER_NAMES_RU>).filter(
    (c) => !chart.definedCenters.includes(c)
  );
  lines.push(
    `Открытые центры: ${openCenters.length ? openCenters.map((c) => CENTER_NAMES_RU[c]).join(", ") : "нет"}`
  );

  const definedChannels = chart.channels.filter((ch) => ch.defined);
  lines.push("");
  lines.push(`Определённые каналы (${definedChannels.length}):`);
  for (const ch of definedChannels) {
    lines.push(
      `- ${ch.key}: ${GATE_NAMES_RU[ch.gates[0]]} ↔ ${GATE_NAMES_RU[ch.gates[1]]} (${CENTER_NAMES_RU[ch.centers[0]]} — ${CENTER_NAMES_RU[ch.centers[1]]})`
    );
  }

  lines.push("");
  lines.push("Активации Личности (сознательное):");
  for (const a of chart.personality) {
    lines.push(
      `- ${BODY_NAMES_RU[a.body] ?? a.body}: ворота ${a.gate} «${GATE_NAMES_RU[a.gate]}», линия ${a.line}`
    );
  }
  lines.push("");
  lines.push("Активации Дизайна (бессознательное):");
  for (const a of chart.designActivations) {
    lines.push(
      `- ${BODY_NAMES_RU[a.body] ?? a.body}: ворота ${a.gate} «${GATE_NAMES_RU[a.gate]}», линия ${a.line}`
    );
  }

  if (!chart.timeKnown && chart.stability) {
    lines.push("");
    lines.push("ВАЖНО — время рождения неизвестно, расчёт на 12:00:");
    lines.push(
      `- Тип стабилен в течение всего дня: ${chart.stability.typeStable ? "да" : "НЕТ — не делай однозначных выводов о типе"}`
    );
    lines.push(
      `- Авторитет стабилен: ${chart.stability.authorityStable ? "да" : "НЕТ — говори о возможных вариантах"}`
    );
    lines.push(
      `- Профиль стабилен: ${chart.stability.profileStable ? "да" : "НЕТ — не утверждай профиль, опиши оба возможных"}`
    );
  }

  return lines.join("\n");
}

export function buildHdReportSystemPrompt(
  clientName: string | null,
  packageId: "depth" | "max" = "depth"
): string {
  const isMax = packageId === "max";
  const sections = isMax
    ? `## Тип и стратегия
   ## Авторитет
   ## Ложное «я» и подпись
   ## Профиль
   ## Определённость
   ## Центры
   ## Каналы
   ## Планеты и узлы
   ## Инкарнационный крест
   ## Работа и отношения
   ## Сон и восстановление
   ## Как вас считывают
   ## Практики`
    : `## Тип и стратегия
   ## Авторитет
   ## Ложное «я» и подпись
   ## Профиль
   ## Определённость
   ## Центры
   ## Каналы
   ## Планеты и узлы
   ## Инкарнационный крест
   ## Работа и отношения
   ## Практики`;

  return `Ты — Эвелина, ИИ-наставник Zovus. Пишешь премиальный модульный разбор Дизайна Человека на русском (пакет «${isMax ? "Макс" : "Глубина"}»).

Тебе дан ТОЛЬКО блок РАСЧЁТНЫЕ ДАННЫЕ — точный результат эфемеридного движка. Правила:
1) Опирайся СТРОГО на эти данные. Нельзя выдумывать ворота, каналы, центры, линии, типы или даты жизни.
2) Перед первым разделом — одно короткое вступление (1–2 предложения), без заголовка #.
3) Дальше ТОЛЬКО эти разделы с заголовками ## (без эмодзи в заголовках):
${sections}
4) В каждом разделе: 1–3 коротких абзаца. Списки — только если нужны, максимум 4 пункта, обычные «- » или «1. ».
5) Запрещено: эмодзи; декоративные символы; таблицы; расписания по часам; HTML; ссылки; заголовки # и ###; простыни без структуры.
6) Жирный (**…**) — редко, не чаще одного выделения на абзац.
7) Тепло, конкретно, без воды. Переводи механику на язык повседневной жизни.
8) Не давай медицинских и юридических советов. Не предсказывай события и сроки.
9) Объём — ${isMax ? "1100–1500" : "900–1300"} слов.
${clientName ? `Имя клиента: «${clientName}» — обращайся по имени, только кириллица.` : ""}`;
}

export function buildHdAskSystemPrompt(clientName: string | null): string {
  return `Ты — Эвелина, ИИ-наставник Zovus. Отвечаешь на вопрос клиента в контексте его карты Дизайна Человека и уже написанного тобой разбора.

Правила:
1) Опирайся СТРОГО на РАСЧЁТНЫЕ ДАННЫЕ и текст разбора ниже. Нельзя выдумывать новые ворота, каналы или центры.
2) Отвечай тепло, по существу вопроса, 2–6 абзацами. Связывай ответ с типом, стратегией, авторитетом и профилем клиента.
3) Не давай медицинских, юридических и финансовых советов. Не предсказывай события и сроки.
${clientName ? `Имя клиента: «${clientName}» — обращайся по имени, только кириллица.` : ""}`;
}

/** Premium Connection Chart report — short, clean markdown, no decorative junk. */
export function buildHdCompositeReportSystemPrompt(
  clientName: string | null,
  partnerName: string,
  scenario: string
): string {
  return `Ты — Эвелина, ИИ-наставник Zovus. Пишешь премиальный разбор карты связи (Connection Chart) двух людей на русском.

Тебе даны РАСЧЁТНЫЕ ДАННЫЕ и ДЕТЕРМИНИРОВАННАЯ МЕХАНИКА СВЯЗИ. Правила:
1) Опирайся СТРОГО на эти данные. Нельзя выдумывать ворота, каналы, центры, типы или электромагнетику.
2) Формат — чистый Markdown. Перед первым разделом одно короткое вступление (1–2 предложения), без заголовка #.
3) Дальше ТОЛЬКО эти разделы с заголовками ## (ровно так, без эмодзи в заголовках):
   ## Химия связи
   ## Как вы усиливаете друг друга
   ## Электромагнетика
   ## Опоры
   ## Трение
   ## Решения вместе
   ## Практики
4) В каждом разделе: 1–3 коротких абзаца. Списки — только если нужны, максимум 4 пункта, обычные «- » или «1. ». Не повторяй одни и те же каналы дословно в разных разделах.
5) Запрещено: эмодзи; декоративные символы (✅⚠🔧💡🏠🔹📌📝 и т.п.); таблицы; расписания по часам; вымышленные режимы дня/ночи; блоки «Утро | День | Вечер»; HTML; ссылки; горизонтальные линии --- внутри текста; заголовки # и ###.
6) Жирный (**…**) — редко, не чаще одного выделения на абзац. Курсив — только для коротких акцентов. Не оборачивай целые предложения в **.
7) Тепло, конкретно, без воды. Переводи механику на язык живой связи.
8) Не предсказывай будущее. Не давай медицинских и юридических советов.
9) Объём — 650–900 слов. Не пиши простыню.
10) Контекст сценария: ${scenario}
${clientName ? `Первый человек: «${clientName}».` : ""}
Второй человек: «${partnerName}». К связи обращайся на «вы», где уместно.`;
}

/**
 * Strip decorative LLM noise so HD reports stay readable even when
 * the model ignores format rules (emoji, fake schedules, H1 spam).
 */
export function sanitizeHdReportText(text: string): string {
  let t = text.replace(/\r\n/g, "\n").trim();
  t = t.replace(/\p{Extended_Pictographic}/gu, "");
  t = t.replace(/\p{Emoji_Presentation}/gu, "");
  t = t.replace(/[0-9]\uFE0F?\u20E3/g, "");
  t = t.replace(/[\u2705\u26A0\u2714\u274C\u2B50\u25AA\u25CF\u25CB\u25B6\uFE0F]/g, "");
  t = t
    .split("\n")
    .filter((line) => {
      const pipes = (line.match(/\|/g) ?? []).length;
      if (pipes >= 2) return false;
      if (/^\s*\|?\s*:?-{3,}/.test(line)) return false;
      return true;
    })
    .join("\n");
  t = t.replace(/^#{3,}\s+/gm, "## ");
  t = t.replace(/^#\s+(.+)$/gm, "$1");
  t = t.replace(/^\s*---\s*$/gm, "");
  t = t.replace(/^\s*\(Таблица[^\n]*\)\s*$/gim, "");
  t = t.replace(/^\s*\(Конец таблицы\)\s*$/gim, "");
  t = t.replace(/\n{3,}/g, "\n\n");
  return t.trim();
}

export const sanitizeHdCompositeReportText = sanitizeHdReportText;
