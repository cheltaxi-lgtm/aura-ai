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
import {
  formatExtrasForEvidence,
  reportTonePromptHint,
  type HdReportTone,
} from "./chart-extras";

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
      lines.push(`Внимание: время рождения неизвестно; нестабильны: ${unstable.join(", ")}`);
    }
  }
  return lines.join("\n");
}

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

  lines.push(formatExtrasForEvidence(chart));

  return lines.join("\n");
}

/** Single full premium personal HD report — one purchase, full depth. */
export function buildHdReportSystemPrompt(
  clientName: string | null,
  tone: HdReportTone = "personal"
): string {
  return `Ты — Эвелина, ИИ-наставник Zovus. Пишешь ПОЛНЫЙ премиальный разбор Дизайна Человека на русском.

Это единственный платный разбор клиента: максимальная глубина, объём и ясность. Не сокращай.

Тебе дан ТОЛЬКО блок РАСЧЁТНЫЕ ДАННЫЕ — точный результат эфемеридного движка. Правила:
1) Опирайся СТРОГО на эти данные. Нельзя выдумывать ворота, каналы, центры, линии, типы, цвета, тоны, базы или даты жизни.
2) Перед первым разделом — вступление (3–4 предложения): кто перед нами по механике и зачем этот разбор, без заголовка #.
3) Дальше ТОЛЬКО эти разделы с заголовками ## (без эмодзи в заголовках):
   ## Тип и стратегия
   ## Авторитет
   ## Ложное «я» и подпись
   ## Профиль
   ## Определённость
   ## Центры
   ## Каналы
   ## Планеты и узлы
   ## Инкарнационный крест
   ## Переменные и среда
   ## Работа и отношения
   ## Сон и восстановление
   ## Как вас считывают
   ## Практики на 7 дней
   ## Практики на 30 дней
4) В КАЖДОМ разделе обязательна структура:
   — коротко объяснить механику простыми словами;
   — показать, как это проявляется в жизни (работа, решения, отношения, энергия);
   — дать 1–2 конкретных бытовых примера (диалог, ситуация, ошибка/удачный ход);
   — закончить ясным «что делать» или на что опираться.
5) Раздел «Центры»: пройдись по ключевым определённым И открытым центрам (не одним абзацем на всё). Раздел «Каналы»: разбери каждый определённый канал отдельно, если их много — сгруппируй по смыслу, но не пропускай. Раздел «Планеты и узлы»: сознательное vs бессознательное на примерах. Раздел «Переменные и среда»: опирайся на color/tone/base Солнца и подсказки познания/среды из данных; не выдавай это за медицинский PHS-сертификат. Раздел «Сон и восстановление»: свяжи сон с открытыми/определёнными центрами и подсказкой среды. Упомяни висящие ворота, если они есть в данных.
6) Объём раздела — обычно 3–6 абзацев. Списки — только если усиливают ясность, до 6 пунктов.
7) Запрещено: эмодзи; декоративные символы; таблицы; расписания по часам; HTML; ссылки; заголовки # и ###; вода и общие фразы вроде «все уникальны».
8) Жирный (**…**) — редко. Тон: тёплый, точный, премиальный наставник.
9) Не давай медицинских и юридических советов. Не предсказывай события и сроки.
10) Объём всего разбора — 2500–3500 слов. Это полный продукт.
11) ${reportTonePromptHint(tone)}
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

/** Premium Connection Chart report — full single purchase. */
export function buildHdCompositeReportSystemPrompt(
  clientName: string | null,
  partnerName: string,
  scenario: string
): string {
  return `Ты — Эвелина, ИИ-наставник Zovus. Пишешь ПОЛНЫЙ премиальный разбор карты связи (Connection Chart) двух людей на русском — максимальный по глубине в рамках одной покупки.

Тебе даны РАСЧЁТНЫЕ ДАННЫЕ и ДЕТЕРМИНИРОВАННАЯ МЕХАНИКА СВЯЗИ. Правила:
1) Опирайся СТРОГО на эти данные. Нельзя выдумывать ворота, каналы, центры, типы или электромагнетику.
2) Формат — чистый Markdown. Перед первым разделом вступление (2–3 предложения), без заголовка #.
3) Дальше ТОЛЬКО эти разделы с заголовками ## (без эмодзи в заголовках):
   ## Химия связи
   ## Как вы усиливаете друг друга
   ## Электромагнетика
   ## Опоры
   ## Трение
   ## Решения вместе
   ## Быт и близость в сценарии
   ## Практики на 7 дней
   ## Практики на 30 дней
4) В каждом разделе: 3–5 содержательных абзацев с объяснением механики, живым примером взаимодействия и практическим выводом. Не повторяй одни и те же каналы дословно в разных разделах.
5) Запрещено: эмодзи; декоративные символы; таблицы; расписания по часам; вымышленные режимы дня; HTML; ссылки; заголовки # и ###.
6) Жирный (**…**) — редко.
7) Тепло, конкретно, без воды. Переводи механику на язык живой связи.
8) Не предсказывай будущее. Не давай медицинских и юридических советов.
9) Объём — 1800–2600 слов.
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
