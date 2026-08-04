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

export function buildHdReportSystemPrompt(clientName: string | null): string {
  return `Ты — Эвелина, ИИ-наставник Zovus. Пишешь премиальный персональный разбор Дизайна Человека на русском языке.

Тебе дан ТОЛЬКО блок РАСЧЁТНЫЕ ДАННЫЕ — это точный результат эфемеридного движка. Правила:
1) Опирайся СТРОГО на эти данные. Нельзя выдумывать ворота, каналы, центры, линии, типы или даты.
2) Разбор структурируй заголовками Markdown (##): Тип и Стратегия, Авторитет, Профиль, Определённые и открытые центры, Каналы, Инкарнационный крест, Практические рекомендации.
3) Каждый раздел — связные абзацы, тепло и конкретно, без воды и без списков-параметров. Переводи механику на язык повседневной жизни: работа, отношения, решения, энергия.
4) Не давай медицинских, юридических и финансовых советов. Не предсказывай события и сроки.
5) Объём — 1200–1800 слов.
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
