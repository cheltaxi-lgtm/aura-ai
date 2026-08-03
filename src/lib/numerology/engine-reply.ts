import { parseBirthDate } from "./constants";
import { fullProfile } from "./profile";
import { pythagorasSquare, type PythagorasSquareResult } from "./pythagoras-square";
import {
  buildHealthNarrativeFinal,
  buildForecastNarrativeReading,
  buildKarmaNarrativeReading,
  buildLifePathNarrativeReading,
  buildPersonalCycleNarrativeReading,
  buildPersonalDaySpreadReading,
  buildPersonalWeekSpreadReading,
  buildPersonalMonthSpreadReading,
  buildPythagorasNarrativeReading,
  formatMatrixLineEntry,
} from "./reading-narrative";
import {
  buildNumerologyChatContext,
  detectNumerologyTopics,
  sessionTopicToNumerologyTopics,
  type NumerologyChatUi,
  type NumerologyTopic,
} from "./topic-handlers";

export interface NumerologEngineReplyInput {
  userName?: string;
  birthDate?: string;
  profileName?: string;
  lastUserMessage: string;
  /** Prior user turns (oldest first), excluding the current message. */
  recentUserMessages?: string[];
  spreadNumbers?: string[];
  intention?: string | null;
}

export interface NumerologEngineReplyResult {
  reply: string;
  ui?: NumerologyChatUi;
  topics: NumerologyTopic[];
  primaryTopic: NumerologyTopic;
  engineFacts: string;
  engineOnly: true;
}

const ENGINE_REPLY_TOPICS = new Set<NumerologyTopic>([
  "life_path",
  "pythagoras_square",
  "sphere_health",
  "sphere_finance",
  "sphere_relations",
  "personal_cycle",
  "karma",
  "forecast_timeline",
  "favorable_dates",
  "chaldean",
  "object_number",
  "compatibility",
  "matrix_compatibility",
  "destiny_matrix",
]);

const CLARIFICATION_RE =
  /(?:^|[\s,.!?])(?:я\s+)?(?:не\s+)?(?:понял|понятно|понимаю|ясно)(?:[\s,.!?]|$)|объясни\s+(?:проще|ещё\s+раз|подробнее)|что\s+это\s+значит|можешь\s+проще|повтори/i;

const RETRY_CALCULATION_RE =
  /(?:ещё|еще)\s+раз|попробуй|пересчит|выведи|повтори|заново|сначала/i;

const HEALTH_SYMPTOM_RE =
  /тахикард|аритми|сердц|давлен|гипертон|голов(?:а|ы|е|у|ой)|сустав|бессон|устал|стресс|болит|беспоко|симптом|паник|тревог|одышк|сахар|диабет|щитовид|желудок|спин/i;

const HEALTH_THREAD_RE =
  /здоров|самочувств|иммунитет|болезн|тахикард|сердц|давлен|беспоко|симптом|болит/i;

const FINANCE_THREAD_RE =
  /финанс|деньг|доход|заработ|материал|кредит|долг(?!и\s*(13|14|16|19))|бюджет|зарплат/i;

const RELATIONS_THREAD_RE =
  /отношен|любов|партн[ёе]р|семь[ея]|брак|муж|жена|свидан|развод/i;

const WORK_LIFE_RE =
  /полиграф|суд|судеб|работ|начальник|коллег|увольн|карьер|должност|офис|бизнес/i;

const STRESS_RE =
  /стресс|тревог|паник|депресс|выгоран|нерв|бессон|устал|пережива|боюсь|страш/i;

function inferTopicFromFreeformMessage(message: string): NumerologyTopic | null {
  const text = message.trim().toLowerCase();
  if (!text) return null;
  if (HEALTH_SYMPTOM_RE.test(text) || STRESS_RE.test(text)) return "sphere_health";
  if (WORK_LIFE_RE.test(text)) return "sphere_finance";
  if (RELATIONS_THREAD_RE.test(text)) return "sphere_relations";
  if (/квадрат|пифагор|матриц/i.test(text)) return "pythagoras_square";
  if (/карм/i.test(text)) return "karma";
  if (/совместим/i.test(text)) return "compatibility";
  if (/пут(?:и|ь|ё)|предназначен|кто\s+я|обо\s+мне|про\s+меня/i.test(text)) {
    return "life_path";
  }
  return "life_path";
}

const SHORT_MESSAGE_MAX_WORDS = 14;
const SHORT_MESSAGE_MAX_CHARS = 140;

const LONG_DURATION_RE =
  /(?:очень\s+)?давно|много\s+лет|годами|давненько|хроническ|с\s+детств|десятилет/i;

const SYMPTOM_LABELS: [RegExp, string][] = [
  [/тахикард|аритми|сердц/i, "тахикардия / сердце"],
  [/давлен|гипертон/i, "давление"],
  [/голов/i, "головные симптомы"],
  [/бессон|устал|стресс|тревог|паник/i, "стресс и нервная система"],
  [/сустав|спин/i, "опорно-двигательная система"],
];

function extractHealthSymptom(...messages: string[]): string | null {
  const text = messages.join(" ").toLowerCase();
  for (const [re, label] of SYMPTOM_LABELS) {
    if (re.test(text)) return label;
  }
  return null;
}

function isLongDurationMessage(message: string): boolean {
  return LONG_DURATION_RE.test(message.trim());
}

type PersonalCycleScope = "day" | "week" | "month" | "full";

function detectPersonalCycleScope(message: string): PersonalCycleScope {
  const text = message.trim().toLowerCase();
  if (/на\s+сегодня|личн(ый|ого|ое|ая)\s+день|расклад.*сегодня|цифр.*сегодня/i.test(text)) {
    return "day";
  }
  if (/на\s+недел|личн(ую|ая|ой|ую)\s+недел|расклад.*недел|цифр.*недел/i.test(text)) {
    return "week";
  }
  if (/на\s+месяц|личн(ый|ого|ое|ий)\s+месяц|расклад.*месяц|цифр.*месяц|в\s+этом\s+месяце/i.test(text)) {
    return "month";
  }
  return "full";
}

function isHealthConversationThread(recentUserMessages: string[], lastMessage: string): boolean {
  return HEALTH_THREAD_RE.test([...recentUserMessages, lastMessage].join(" "));
}

function isShortUserMessage(message: string): boolean {
  const text = message.trim();
  if (!text) return true;
  const words = text.split(/\s+/).filter(Boolean);
  return words.length <= SHORT_MESSAGE_MAX_WORDS || text.length <= SHORT_MESSAGE_MAX_CHARS;
}

function inferThreadTopic(
  recentUserMessages: string[],
  lastMessage: string
): NumerologyTopic | null {
  const all = [...recentUserMessages, lastMessage].join(" ").toLowerCase();
  if (HEALTH_THREAD_RE.test(all) || STRESS_RE.test(all)) return "sphere_health";
  if (FINANCE_THREAD_RE.test(all) || WORK_LIFE_RE.test(all)) return "sphere_finance";
  if (RELATIONS_THREAD_RE.test(all)) return "sphere_relations";
  if (/квадрат\s+пифагора|психоматриц|\bматриц/i.test(all)) return "pythagoras_square";
  if (/личн(ый|ого)\s*(год|месяц|день)|прогноз\s+на|9\s+лет/i.test(all)) return "personal_cycle";
  if (/пут(?:и|ь|ё)|кто\s+я|обо\s+мне|предназначен|призван|миссия|про\s+меня/i.test(all)) {
    return "life_path";
  }
  if (/карм/i.test(all)) return "karma";
  if (/совместимост/i.test(all)) return "compatibility";
  if (/халдей/i.test(all)) return "chaldean";
  if (/числ(о|а)\s+(объект|телефон|номер|авто|машин|адрес)|телефон|номер\s+авто/i.test(all)) return "object_number";
  if (/удачн(ый|ые)\s+дат|благоприятн/i.test(all)) return "favorable_dates";
  return null;
}

/** Last explicit calculation topic in user history (newest first). */
function inferSessionTopic(
  recentUserMessages: string[],
  lastMessage: string
): NumerologyTopic | null {
  for (let i = recentUserMessages.length - 1; i >= 0; i--) {
    const primary = pickPrimaryTopic(detectNumerologyTopics(recentUserMessages[i]!));
    if (primary) return primary;
  }
  return pickPrimaryTopic(detectNumerologyTopics(lastMessage));
}

function extractEngineFacts(prompt: string, topic: NumerologyTopic): string {
  const markers: Partial<Record<NumerologyTopic, string>> = {
    life_path: "ЧИСЛО ЖИЗНЕННОГО ПУТИ",
    pythagoras_square: "КВАДРАТ ПИФАГОРА",
    sphere_health: "СФЕРА ЗДОРОВЬЕ",
    sphere_finance: "СФЕРА ФИНАНСЫ",
    sphere_relations: "СФЕРА ОТНОШЕНИЯ",
    personal_cycle: "РАСЧЁТ ЛИЧНОГО ЦИКЛА",
    karma: "КАРМИЧЕСКИЙ БЛОК",
    forecast_timeline: "ПРОГНОЗ ЛИЧНЫХ ГОДОВ",
    favorable_dates: "БЛАГОПРИЯТНЫЕ ДАТЫ",
    chaldean: "ХАЛДЕЙСКАЯ СИСТЕМА",
    object_number: "ЧИСЛО ОБЪЕКТА",
    compatibility: "СОВМЕСТИМОСТЬ",
    matrix_compatibility: "СОВМЕСТИМОСТЬ МАТРИЦ СУДЬБЫ",
    destiny_matrix: "МАТРИЦА СУДЬБЫ",
  };
  const marker = markers[topic];
  if (marker) {
    const block = prompt.split("\n\n").find((p) => p.startsWith(marker));
    if (block) return block.trim();
  }
  return prompt.slice(0, 2500).trim();
}

function formatUserNoteBlock(userMessage: string): string {
  const note = userMessage.trim().replace(/\s+/g, " ");
  if (!note || note.length > 200) return "";
  return `Контекст вопроса: «${note}»`;
}

function shouldShowUserNote(message: string): boolean {
  if (!isShortUserMessage(message)) return false;
  if (detectNumerologyTopics(message.trim()).length > 0) return false;
  return true;
}

/** Rich fact bundle for LLM — user question + core matrix blocks. */
export function buildRichEngineFacts(params: {
  prompt: string;
  primaryTopic: NumerologyTopic;
  userMessage: string;
  fallbackFacts?: string;
}): string {
  const chunks: string[] = [];
  const question = params.userMessage.trim();
  if (question) {
    chunks.push(`ВОПРОС КЛИЕНТА:\n«${question.slice(0, 600)}»`);
  }

  // Destiny matrix is a closed 22-arcana system — do not attach LP / Pythagoras.
  if (params.primaryTopic === "destiny_matrix") {
    const matrixBlock = extractEngineFacts(params.prompt, "destiny_matrix");
    if (matrixBlock) chunks.push(matrixBlock);
    const clientBlock = params.prompt
      .split("\n\n")
      .find((p) => p.startsWith("КЛИЕНТ ДЛЯ МАТРИЦЫ СУДЬБЫ:"));
    if (clientBlock) chunks.unshift(clientBlock.trim());
    return chunks.join("\n\n").slice(0, 6500);
  }

  const topicsForFacts = new Set<NumerologyTopic>([params.primaryTopic]);
  if (params.primaryTopic !== "life_path") topicsForFacts.add("life_path");
  if (
    params.primaryTopic !== "pythagoras_square" &&
    !String(params.primaryTopic).startsWith("sphere_")
  ) {
    topicsForFacts.add("pythagoras_square");
  }

  for (const topic of topicsForFacts) {
    const block = extractEngineFacts(params.prompt, topic);
    if (block && !chunks.includes(block)) chunks.push(block);
  }

  const fallback = params.fallbackFacts?.trim();
  if (fallback) {
    const alreadyIncluded = chunks.some(
      (chunk) => chunk.includes(fallback.slice(0, 64)) || fallback.includes(chunk.slice(0, 64))
    );
    if (!alreadyIncluded) {
      chunks.unshift(fallback);
    }
  }

  return chunks.join("\n\n").slice(0, 4000);
}

function shouldAttachPythagorasGrid(topic: NumerologyTopic): boolean {
  return topic === "pythagoras_square";
}

function formatContextualFollowUp(
  name: string,
  square: PythagorasSquareResult,
  topic: NumerologyTopic,
  userMessage: string,
  input: NumerologEngineReplyInput,
  options: {
    simplify?: boolean;
    symptom?: string | null;
    chronic?: boolean;
    retry?: boolean;
    fullName?: string;
  }
): string {
  const note = shouldShowUserNote(userMessage) ? formatUserNoteBlock(userMessage) : "";
  const birthDate = input.birthDate?.trim() ?? "";

  let body: string;
  switch (topic) {
    case "sphere_health":
      body = formatSphereHealth(name, square, {
        simplify: options.simplify,
        birthDate,
        fullName: options.fullName,
        symptom: options.symptom ?? extractHealthSymptom(userMessage),
        chronic: options.chronic ?? isLongDurationMessage(userMessage),
        retry: options.retry,
      });
      break;
    case "sphere_finance":
      body = formatSphereFinance(name, square, options.simplify);
      break;
    case "sphere_relations":
      body = formatSphereRelations(name, square, options.simplify);
      break;
    case "karma":
      body = buildKarmaNarrativeReading({
        name,
        birthDate,
        fullName: options.fullName ?? name,
        simplify: options.simplify,
      });
      break;
    case "pythagoras_square":
      body = formatPythagorasReading(name, square, {
        simplify: options.simplify,
        birthDate: input.birthDate?.trim(),
        fullName: options.fullName,
        spreadNumbers: input.spreadNumbers,
      });
      break;
    default:
      body = formatPythagorasReading(name, square, {
        simplify: options.simplify,
        birthDate: input.birthDate?.trim(),
        fullName: options.fullName,
        spreadNumbers: input.spreadNumbers,
      });
      break;
  }

  if (!note) return body;
  return `${note}\n\n${body}`;
}

function resolveActiveTopics(
  lastUserMessage: string,
  recentUserMessages: string[],
  intention?: string | null
): NumerologyTopic[] {
  const trimmed = lastUserMessage.trim();
  const explicit = detectNumerologyTopics(trimmed);
  const fromIntention = sessionTopicToNumerologyTopics(intention);

  if (RETRY_CALCULATION_RE.test(trimmed)) {
    const found = new Set<NumerologyTopic>(explicit);
    for (let i = recentUserMessages.length - 1; i >= 0; i--) {
      for (const topic of detectNumerologyTopics(recentUserMessages[i]!)) {
        found.add(topic);
      }
      if (found.size > 0) break;
    }
    if (found.size === 0) {
      if (isHealthConversationThread(recentUserMessages, lastUserMessage)) {
        found.add("sphere_health");
      } else if (/квадрат|пифагор|матриц/i.test(recentUserMessages.join(" "))) {
        found.add("pythagoras_square");
      } else {
        found.add("pythagoras_square");
      }
    }
    return [...found];
  }

  if (explicit.length > 0) {
    const found = new Set<NumerologyTopic>(explicit);
    if (HEALTH_SYMPTOM_RE.test(trimmed)) {
      found.add("sphere_health");
    }
    return [...found];
  }

  const resolved = resolveNumerologyMessageForTopics(lastUserMessage, recentUserMessages);
  const fromMessage = detectNumerologyTopics(resolved);
  const found = new Set<NumerologyTopic>(fromMessage);

  if (HEALTH_SYMPTOM_RE.test(trimmed)) {
    found.add("sphere_health");
  }

  if (
    isLongDurationMessage(lastUserMessage) &&
    isHealthConversationThread(recentUserMessages, lastUserMessage)
  ) {
    found.add("sphere_health");
  }

  const inConversation = recentUserMessages.length > 0;

  if (inConversation && isShortUserMessage(lastUserMessage)) {
    const thread = inferThreadTopic(recentUserMessages, lastUserMessage);
    if (thread) found.add(thread);
    else {
      const session = inferSessionTopic(recentUserMessages, lastUserMessage);
      if (session) found.add(session);
    }
  }

  if (found.size === 0 && inConversation) {
    const thread = inferThreadTopic(recentUserMessages, lastUserMessage);
    if (thread) found.add(thread);
    else {
      const session = inferSessionTopic(recentUserMessages, lastUserMessage);
      if (session) found.add(session);
    }
  }

  if (
    found.size === 0 &&
    isHealthConversationThread(recentUserMessages, lastUserMessage) &&
    inConversation
  ) {
    found.add("sphere_health");
  }

  if (found.size === 0 && fromIntention.length > 0) {
    for (const t of fromIntention) found.add(t);
  }

  return [...found];
}

function pickPrimaryTopic(topics: NumerologyTopic[]): NumerologyTopic | null {
  const priority: NumerologyTopic[] = [
    "karma",
    "life_path",
    "personal_cycle",
    "forecast_timeline",
    "favorable_dates",
    "matrix_compatibility",
    "compatibility",
    "chaldean",
    "object_number",
    "sphere_health",
    "sphere_finance",
    "sphere_relations",
    "destiny_matrix",
    "pythagoras_square",
  ];
  for (const p of priority) {
    if (topics.includes(p)) return p;
  }
  return topics[0] ?? null;
}

function displayName(input: NumerologEngineReplyInput): string {
  return (input.userName || input.profileName || "друг").trim() || "друг";
}

function firstName(input: NumerologEngineReplyInput): string {
  const full = displayName(input);
  return full.split(/\s+/)[0] || full;
}

export function isNumerologClarificationRequest(message: string): boolean {
  return CLARIFICATION_RE.test(message.trim());
}

export function resolveNumerologyMessageForTopics(
  lastUserMessage: string,
  recentUserMessages: string[] = []
): string {
  if (isNumerologClarificationRequest(lastUserMessage) && recentUserMessages.length > 0) {
    return recentUserMessages[recentUserMessages.length - 1]!.trim();
  }
  return lastUserMessage.trim();
}

function cellLabel(n: number, count: number): string {
  if (count === 0) return "пусто";
  return String(n).repeat(count);
}

function formatPythagorasReading(
  name: string,
  square: PythagorasSquareResult,
  options?: { simplify?: boolean; birthDate?: string; fullName?: string; spreadNumbers?: string[] }
): string {
  const profile =
    options?.birthDate && parseBirthDate(options.birthDate)
      ? fullProfile(options.birthDate, options.fullName ?? name)
      : null;

  return buildPythagorasNarrativeReading({
    name,
    square,
    profile,
    spreadNumbers: options?.spreadNumbers,
    simplify: options?.simplify,
  });
}

function formatSphereHealth(
  name: string,
  square: PythagorasSquareResult,
  options?: {
    simplify?: boolean;
    birthDate?: string;
    fullName?: string;
    symptom?: string | null;
    chronic?: boolean;
    retry?: boolean;
  }
): string {
  const i = square.interpretation;
  const stability = square.lines.rows.find((l) => l.label.includes("3-6-9"));
  const selfLine = square.lines.cols.find((l) => l.label.includes("1-2-3"));
  const now = new Date();
  const profile =
    options?.birthDate && parseBirthDate(options.birthDate)
      ? fullProfile(options.birthDate, options.fullName ?? name)
      : null;
  const py = profile?.personalYear;
  const pm = profile?.personalMonth;

  const intro = options?.retry
    ? `${name}, пересчитываю **только по квадрату Пифагора** — это ячейки матрицы по дате рождения, не числа расклада 33·1·6.`
    : options?.symptom
      ? `${name}, разберём **${options.symptom}** через квадрат Пифагора — без выдуманных «путь 8 / период 4».`
      : `${name}, разберём **здоровье** по реальному квадрату Пифагора.`;

  const cellBlock = [
    "## Что в твоей матрице",
    "",
    `**Ячейка 3 (здоровье и восстановление):** ${cellLabel(3, i.health.count)} — ${i.health.summary}`,
    `**Ячейка 2 (жизненная энергия):** ${cellLabel(2, i.energy.count)} — ${i.energy.summary}`,
    `**Ячейка 1 (воля, напор):** ${cellLabel(1, i.character.count)} — ${i.character.summary}`,
    stability ? formatMatrixLineEntry(stability) : "",
    selfLine ? formatMatrixLineEntry(selfLine) : "",
  ]
    .filter(Boolean)
    .join("\n");

  const explainBlock = [
    "Коротко по матрице",
    "",
    i.health.count === 0
      ? "Пустая **тройка** — главный маркер: телу сложнее накапливать запас сил. Это не диагноз, а «слабое место» матрицы — его берегут режимом, а не рывками."
      : `Тройка не пустая (${cellLabel(3, i.health.count)}) — база восстановления есть, но её нужно поддерживать.`,
    i.character.count >= 2
      ? "Сильная **единица** (воля) — ты можешь терпеть и «давить», даже когда тело уже сигналит. Отсюда риск игнорировать симптомы годами."
      : "Единица умеренная — воля есть, но без жёсткого «пробьюсь любой ценой».",
    i.energy.count <= 1
      ? "Энергия (двойка) не избыточная — перегруз быстрее бьёт по самочувствию."
      : "Энергии (двойка) достаточно — но без тройки её легко «сжечь».",
  ].join("\n");

  let symptomBlock = "";
  if (options?.symptom?.includes("серд") || options?.symptom?.includes("тахикард")) {
    symptomBlock = [
      "## Про сердце и тахикардию (нумерологически)",
      "",
      "Я **не ставлю диагноз** — к врачу/cardiolog это отдельно. По матрице картина такая:",
      "",
      "— Пустая тройка + сильная воля = тело годами работает «на характере», а не на запасе.",
      "— Тахикардия часто усиливается, когда **нет восстановления** (тройка) и **много напряжения** (единица, стресс).",
      "— Это не «число 4 в периоде» — смотри только ячейки 1, 2, 3 выше.",
    ].join("\n");
  } else if (options?.symptom) {
    symptomBlock = [
      `## Про ${options.symptom}`,
      "",
      "Связка та же: смотрим ячейки 1–3, а не числа расклада. Симптом — повод беречь ресурс, а не «терпеть сильнее».",
    ].join("\n");
  }

  let chronicBlock = "";
  if (options?.chronic) {
    chronicBlock = [
      "## Долгий срок («много лет»)",
      "",
      "Хроническое — это как раз сценарий **пустой тройки + сильной единицы**: годами терпишь, не меняя ритм. Нумерология здесь не про «5 месяцев лечения», а про **смену режима**: сон, нагрузка, стресс, регулярность.",
    ].join("\n");
  }

  const cycleBlock =
    py && pm
      ? [
          "## Личный цикл (реальный расчёт)",
          "",
          `**Личный год ${now.getFullYear()}:** ${py.number} — ${py.title}. ${py.meaning.split(".")[0]?.trim() ?? py.meaning}.`,
          `**Личный месяц:** ${pm.number} — ${pm.title}.`,
          "Цикл — фон, не замена врачу. Он показывает, где легче вводить новые привычки.",
        ].join("\n")
      : "";

  const actionBlock = options?.simplify
    ? [
        "## Что делать",
        "",
        "— Не геройствовать на пустой тройке: сон, паузы, меньше «дожима».",
        "— Следить за стрессом — он бьёт по двойке и по сердцу.",
        "— Напиши, что именно беспокоит (сердце, сон, давление) — разберём точечно.",
      ].join("\n")
    : [
        "## Практика (не медицина)",
        "",
        "— Режим сна и отдыха — при пустой тройке это не слабость, а опора.",
        "— Убрать постоянный «дожим» — сильная единица любит терпеть; тело этого не прощает годами.",
        "— Мягкая регулярность вместо рывков: прогулки, дыхание, меньше перегруза.",
        "",
        "Если нужно — разберём **финансы** или **личный год** тем же методом, без выдуманных цифр.",
      ].join("\n");

  return [
    intro,
    "",
    cellBlock,
    "",
    explainBlock,
    symptomBlock,
    chronicBlock,
    cycleBlock,
    actionBlock,
    "",
    buildHealthNarrativeFinal(name, square, profile, {
      symptom: options?.symptom,
      chronic: options?.chronic,
    }),
  ]
    .filter(Boolean)
    .join("\n\n");
}

function formatSphereFinance(name: string, square: PythagorasSquareResult, simplify?: boolean): string {
  const i = square.interpretation;
  const material = square.lines.cols.find((l) => l.label.includes("4-5-6"));

  if (simplify) {
    return [
      `${name}, про деньги по квадрату.`,
      "",
      `Труд (5): ${cellLabel(5, i.labor.count)} — ${i.labor.summary}`,
      `Удача (6): ${cellLabel(6, i.luck.count)} — ${i.luck.summary}`,
      material ? `${material.label}: ${material.summary}` : "",
      "",
      "Суть: деньги приходят через дисциплину и систему, а не через хаос. Пустая пятёрка — нужен план, а не импульс.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `${name}, разберём финансы по квадрату Пифагора.`,
    "",
    `Труд и деньги (5): ${cellLabel(5, i.labor.count)} — ${i.labor.summary}`,
    `Удача (6): ${cellLabel(6, i.luck.count)} — ${i.luck.summary}`,
    `Логика (4): ${cellLabel(4, i.logic.count)} — ${i.logic.summary}`,
    material ? `${material.label}: ${material.summary}` : "",
    "",
    "Материальная линия — про стабильный доход через навык и терпение, а не про «удачу одним днём».",
    i.labor.count === 0
      ? "Пустая пятёрка: финансовый рост через структуру — расписание, навык, один фокус."
      : "Пятёрка не пустая — зарабатываешь через дело, но важно не распыляться.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatSphereRelations(name: string, square: PythagorasSquareResult, simplify?: boolean): string {
  const i = square.interpretation;
  const familyLine = square.lines.rows.find((l) => l.label.includes("2-5-8"));

  if (simplify) {
    return [
      `${name}, про отношения по квадрату.`,
      "",
      `Энергия (2): ${cellLabel(2, i.energy.count)} — ${i.energy.summary}`,
      `Удача (6): ${cellLabel(6, i.luck.count)} — ${i.luck.summary}`,
      familyLine ? `${familyLine.label}: ${familyLine.summary}` : "",
      "",
      "Суть: качество связи зависит от твоего ресурса — если энергия на нуле, отношения тоже напрягаются.",
    ]
      .filter(Boolean)
      .join("\n");
  }

  return [
    `${name}, разберём отношения по квадрату Пифагора.`,
    "",
    `Энергия для близости (2): ${cellLabel(2, i.energy.count)} — ${i.energy.summary}`,
    `Характер (1): ${cellLabel(1, i.character.count)} — ${i.character.summary}`,
    `Удача в союзе (6): ${cellLabel(6, i.luck.count)} — ${i.luck.summary}`,
    familyLine ? `${familyLine.label}: ${familyLine.summary}` : "",
    "",
    "В отношениях видно, хватает ли тебе сил на близость и где включается контроль.",
    "Если нужна совместимость с конкретным человеком — назови его дату рождения, посчитаю пару.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatFromContextBlock(
  name: string,
  topics: NumerologyTopic[],
  prompt: string,
  simplify?: boolean
): string | null {
  if (topics.includes("personal_cycle")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("РАСЧЁТ ЛИЧНОГО ЦИКЛА"));
    if (block) {
      return simplify
        ? `${name}, коротко про цикл:\n\n${block.replace("РАСЧЁТ ЛИЧНОГО ЦИКЛА (реальный):", "").trim()}`
        : `${name}, вот твой личный цикл:\n\n${block.replace("РАСЧЁТ ЛИЧНОГО ЦИКЛА (реальный):", "").trim()}`;
    }
  }
  if (topics.includes("karma")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("КАРМИЧЕСКИЙ БЛОК"));
    if (block) {
      return `${name}, твоя карма по числам:\n\n${block.replace("КАРМИЧЕСКИЙ БЛОК (реальный расчёт):", "").trim()}`;
    }
  }
  if (topics.includes("forecast_timeline")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("ПРОГНОЗ ЛИЧНЫХ ГОДОВ"));
    if (block) {
      return `${name}, прогноз на 9 личных лет:\n\n${block.replace("ПРОГНОЗ ЛИЧНЫХ ГОДОВ на 9 лет от", "От").trim()}`;
    }
  }
  if (topics.includes("favorable_dates")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("БЛАГОПРИЯТНЫЕ ДАТЫ"));
    if (block) {
      return `${name}, удачные даты:\n\n${block.replace("БЛАГОПРИЯТНЫЕ ДАТЫ", "Даты").trim()}`;
    }
  }
  if (topics.includes("chaldean")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("ХАЛДЕЙСКАЯ СИСТЕМА"));
    if (block) {
      return `${name}, халдейский расчёт:\n\n${block.replace("ХАЛДЕЙСКАЯ СИСТЕМА (реальный пересчёт имён):", "").trim()}`;
    }
  }
  if (topics.includes("object_number")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("ЧИСЛО ОБЪЕКТА") || p.includes("ЧИСЛО"));
    if (block) return `${name}, ${block.trim()}`;
  }
  if (topics.includes("matrix_compatibility")) {
    const block = prompt
      .split("\n\n")
      .find((p) => p.startsWith("СОВМЕСТИМОСТЬ МАТРИЦ СУДЬБЫ"));
    if (block) return `${name}, ${block.trim()}`;
  }
  if (topics.includes("compatibility")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("СОВМЕСТИМОСТЬ") || p.includes("score"));
    if (block) return `${name}, ${block.trim()}`;
  }
  if (topics.includes("destiny_matrix")) {
    const block = prompt.split("\n\n").find((p) => p.startsWith("МАТРИЦА СУДЬБЫ"));
    if (block) {
      return `${name}, твоя матрица судьбы:\n\n${block
        .replace(
          /^МАТРИЦА СУДЬБЫ \/ 22 АРКАНА \([^)]+\):\s*/m,
          ""
        )
        .trim()}`;
    }
  }
  return null;
}

/** Deterministic Evelina reply from numerology engine — no LLM. */
export function buildNumerologEngineReply(
  input: NumerologEngineReplyInput
): NumerologEngineReplyResult | null {
  const recent = input.recentUserMessages ?? [];
  const clarify = isNumerologClarificationRequest(input.lastUserMessage);
  const allTopics = resolveActiveTopics(
    input.lastUserMessage,
    recent,
    input.intention
  );
  const resolvedMessage = resolveNumerologyMessageForTopics(input.lastUserMessage, recent);

  if (clarify && allTopics.length === 0) {
    if (isHealthConversationThread(recent, input.lastUserMessage)) {
      allTopics.push("sphere_health");
    } else {
      const fromIntention = sessionTopicToNumerologyTopics(input.intention);
      const thread =
        fromIntention[0] ??
        inferThreadTopic(recent, input.lastUserMessage) ??
        inferSessionTopic(recent, input.lastUserMessage) ??
        "life_path";
      allTopics.push(thread);
    }
  }

  const actionable = allTopics.filter((t) => ENGINE_REPLY_TOPICS.has(t));

  const birthDate = input.birthDate?.trim() ?? "";
  const hasBirth = Boolean(parseBirthDate(birthDate));
  const inConversation = recent.length > 0;

  let topicsToUse = actionable;
  if (topicsToUse.length === 0 && hasBirth && inConversation) {
    const fallback =
      inferThreadTopic(recent, input.lastUserMessage) ??
      inferSessionTopic(recent, input.lastUserMessage) ??
      "pythagoras_square";
    topicsToUse = [fallback];
  }

  if (topicsToUse.length === 0 && hasBirth) {
    const freeform = inferTopicFromFreeformMessage(input.lastUserMessage);
    if (freeform) {
      topicsToUse = [freeform];
    } else if (input.lastUserMessage.trim()) {
      topicsToUse = [inferThreadTopic(recent, input.lastUserMessage) ?? "life_path"];
    }
  }

  if (topicsToUse.length === 0) return null;

  const name = firstName(input);
  const primary = pickPrimaryTopic(topicsToUse) ?? topicsToUse[0]!;
  const explicitInMessage = detectNumerologyTopics(input.lastUserMessage.trim());
  const symptom = extractHealthSymptom(...recent, input.lastUserMessage);
  const chronic = isLongDurationMessage(input.lastUserMessage);
  const retry = RETRY_CALCULATION_RE.test(input.lastUserMessage.trim());
  const shortFollowUp =
    inConversation &&
    isShortUserMessage(input.lastUserMessage) &&
    explicitInMessage.length === 0;

  const ctx = buildNumerologyChatContext({
    birthDate: input.birthDate,
    profileName: input.profileName ?? input.userName,
    lastUserMessage: resolvedMessage,
    intention: input.intention,
  });

  let ui: NumerologyChatUi | undefined;
  let reply: string | null = null;
  const fullName = ctx.resolvedName.fullName || input.profileName || input.userName || name;

  if (primary === "karma" && hasBirth) {
    reply = buildKarmaNarrativeReading({
      name,
      birthDate,
      fullName,
      simplify: clarify,
    });
  } else if (primary === "life_path" && hasBirth) {
    reply = buildLifePathNarrativeReading({
      name,
      birthDate,
      fullName,
      simplify: clarify,
    });
  } else if (primary === "forecast_timeline" && hasBirth) {
    reply = buildForecastNarrativeReading({ name, birthDate });
  } else if (primary === "personal_cycle" && hasBirth) {
    const scope = detectPersonalCycleScope(input.lastUserMessage);
    if (scope === "day") {
      reply = buildPersonalDaySpreadReading({ name, birthDate });
    } else if (scope === "week") {
      reply = buildPersonalWeekSpreadReading({ name, birthDate });
    } else if (scope === "month") {
      reply = buildPersonalMonthSpreadReading({ name, birthDate });
    } else {
      reply = buildPersonalCycleNarrativeReading({ name, birthDate });
    }
  } else if (
    [
      "favorable_dates",
      "chaldean",
      "object_number",
      "compatibility",
      "matrix_compatibility",
      "destiny_matrix",
    ].includes(primary)
  ) {
    reply = formatFromContextBlock(name, topicsToUse, ctx.prompt, clarify);
  }

  if (hasBirth && !reply) {
    const square = pythagorasSquare(birthDate);
    if (square) {
      const formatOpts = {
        simplify: clarify,
        fullName,
        symptom,
        chronic,
        retry,
      };

      if (shortFollowUp) {
        reply = formatContextualFollowUp(
          name,
          square,
          primary,
          input.lastUserMessage,
          input,
          formatOpts
        );
      } else if (primary === "pythagoras_square") {
        reply = formatPythagorasReading(name, square, {
          simplify: clarify,
          birthDate,
          fullName,
          spreadNumbers: input.spreadNumbers,
        });
        ui = { pythagorasSquare: square };
      } else if (primary === "sphere_health") {
        reply = formatSphereHealth(name, square, {
          ...formatOpts,
          birthDate,
        });
      } else if (primary === "sphere_finance") {
        reply = formatSphereFinance(name, square, clarify);
      } else if (primary === "sphere_relations") {
        reply = formatSphereRelations(name, square, clarify);
      }
    }
  }

  if (!reply) {
    reply = formatFromContextBlock(name, topicsToUse, ctx.prompt, clarify);
  }

  if (!reply) {
    const needsBirth = topicsToUse.some((t) =>
      [
        "pythagoras_square",
        "sphere_health",
        "sphere_finance",
        "sphere_relations",
        "personal_cycle",
        "forecast_timeline",
        "favorable_dates",
        "karma",
      ].includes(t)
    );
    if (needsBirth && !hasBirth) {
      reply = `${name}, для расчёта нужна **дата рождения** — назови её, посчитаю ячейки матрицы без догадок.`;
    } else if (hasBirth && primary !== "karma") {
      const square = pythagorasSquare(birthDate);
      if (square && shortFollowUp) {
        reply = formatContextualFollowUp(
          name,
          square,
          primary,
          input.lastUserMessage,
          input,
          {
            simplify: clarify,
            fullName,
            symptom,
            chronic,
            retry,
          }
        );
      } else if (square && primary === "pythagoras_square") {
        reply = formatPythagorasReading(name, square, {
          simplify: clarify,
          birthDate,
          fullName,
          spreadNumbers: input.spreadNumbers,
        });
        ui = { pythagorasSquare: square };
      } else {
        reply = ctx.prompt.split("\n\n").slice(-2).join("\n\n").trim() || null;
      }
    } else {
      reply = ctx.prompt.split("\n\n").slice(-2).join("\n\n").trim() || null;
    }
  }

  if (!reply?.trim()) return null;

  if (!ui && shouldAttachPythagorasGrid(primary) && hasBirth) {
    const square = pythagorasSquare(birthDate);
    if (square) ui = { pythagorasSquare: square };
  }

  return {
    reply: reply.trim(),
    ui,
    topics: topicsToUse,
    primaryTopic: primary,
    engineFacts: extractEngineFacts(ctx.prompt, primary),
    engineOnly: true,
  };
}
