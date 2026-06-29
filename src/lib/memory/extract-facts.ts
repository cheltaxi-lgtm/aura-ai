/**
 * Extracts durable, cross-master client facts from a chat turn using the main
 * chat model (DeepSeek via OpenRouter). Only stable, real-world facts about the
 * *client* are kept — the master's mystical interpretations, cards and small
 * talk are discarded. Output is normalized, quality-filtered Russian facts.
 */
import { completeChat } from "@/lib/llm";
import type { FactInput } from "@/lib/memory/user-facts";

function buildExtractSystem(today: string): string {
  return `Ты — модуль долговременной памяти таро-сервиса. Из реплики клиента извлекай ТОЛЬКО устойчивые факты о его реальной жизни, которые пригодятся мастеру в будущих сеансах.

Сегодняшняя дата: ${today}.

ИЗВЛЕКАЙ (о самом клиенте и его близких):
- семья и близкие: имена, роли, отношения (жена, сын Артём, мать);
- работа, учёба, бизнес, деньги, долги;
- здоровье, диагнозы, беременность;
- отношения: брак, развод, расставание, влюблённость;
- переезды, поездки;
- конкретные события с датами (экзамен, свадьба, суд, операция, собеседование);
- цели, планы, страхи, ключевой запрос клиента.

НЕ ИЗВЛЕКАЙ (это мусор, пропускай):
- слова и трактовки мастера, советы, предсказания;
- упоминания карт, рун, раскладов, гаданий, энергий, гороскопов;
- эмоции момента, вежливость, общие рассуждения без фактов;
- сам вопрос-гадание без фактической информации;
- факты, которые УЖЕ ИЗВЕСТНЫ (см. блок ниже) и не изменились — повторять не нужно.

ИЗМЕНЕНИЯ: если реплика меняет уже известный факт (было «ищет работу» → стало «вышел на работу»; «в браке» → «разводится»), извлеки НОВЫЙ факт с актуальным положением. Старый не трогаем — приоритет свежего решается при чтении.

ПРАВИЛА:
- Пиши факт КРАТКО, в 3-м лице, ПО-РУССКИ (например: «У клиента сын Артём, выпускной 25 июня»).
- Даты событий — в формате YYYY-MM-DD. Если год не указан, выбери БЛИЖАЙШУЮ будущую дату относительно сегодня (${today}).
- Если событие уже прошло (дата раньше сегодня) — не извлекай его как «ближайшее»; можно сохранить без eventDate как семейный фон или пропустить, если это только разовая дата.
- salience: 5 — критично (тяжёлая болезнь, развод, смерть близкого, ключевой запрос), 4 — важно, 3 — обычный факт, 2 — второстепенно, 1 — мелочь.
- category строго одна из: family, work, health, money, relationship, event, goal, other.

Верни СТРОГО JSON-массив объектов без markdown и пояснений:
[{"fact":"...","category":"family","eventDate":"YYYY-MM-DD"|null,"salience":3}]
Если устойчивых фактов нет — верни [].`;
}

interface RawFact {
  fact?: unknown;
  category?: unknown;
  eventDate?: unknown;
  salience?: unknown;
}

const VALID_CATEGORIES = new Set([
  "family",
  "work",
  "health",
  "money",
  "relationship",
  "event",
  "goal",
  "other",
]);

const CYRILLIC_RE = /[а-яё]/i;

/** Heavy life events — always treated as high salience regardless of model. */
const CRITICAL_RE =
  /(развод|расстал|расхо|измен[аыу]|смерт|умер|похорон|онколог|\bрак\b|опухол|инсульт|инфаркт|операци|беремен|выкидыш|увол|сокращ|банкрот|долг|суд\b|иск\b|насили|депресс|суицид|зависим)/i;

/** Apply a salience floor for facts that mention heavy life events. */
function boostSalience(fact: string, salience: number): number {
  if (CRITICAL_RE.test(fact)) return Math.max(salience, 5);
  return salience;
}

/** Facts that are clearly about the reading/master, not the client. */
const META_FACT_RE =
  /(карт[аыуои]?|таро|рун[аыуои]?|раскла|гадани|предсказ|астролог|гороскоп|зодиак|энерги|мастер|ассистент|assistant|tarot|card)/i;

function isQualityFact(fact: string): boolean {
  const f = fact.trim();
  if (f.length < 6 || f.length > 600) return false;
  if (!CYRILLIC_RE.test(f)) return false; // must be Russian, not English meta
  if (META_FACT_RE.test(f)) return false; // reject reading/master content
  return true;
}

function parseFacts(raw: string): FactInput[] {
  let text = raw.trim();
  const arrMatch = text.match(/\[[\s\S]*\]/);
  if (arrMatch) text = arrMatch[0];

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    const objMatch = raw.match(/\{[\s\S]*\}/);
    if (!objMatch) return [];
    try {
      parsed = JSON.parse(objMatch[0]);
    } catch {
      return [];
    }
  }

  let items: RawFact[];
  if (Array.isArray(parsed)) {
    items = parsed as RawFact[];
  } else if (parsed && typeof parsed === "object") {
    const obj = parsed as Record<string, unknown>;
    if (Array.isArray(obj.facts)) items = obj.facts as RawFact[];
    else if (typeof obj.fact === "string") items = [obj as RawFact];
    else return [];
  } else {
    return [];
  }

  const out: FactInput[] = [];
  for (const item of items) {
    const fact = typeof item?.fact === "string" ? item.fact.trim() : "";
    if (!isQualityFact(fact)) continue;

    const category =
      typeof item.category === "string" && VALID_CATEGORIES.has(item.category)
        ? item.category
        : "other";

    const eventDate =
      typeof item.eventDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.eventDate)
        ? item.eventDate
        : null;

    const salienceNum =
      typeof item.salience === "number" ? item.salience : Number(item.salience) || 3;

    out.push({
      fact: fact.slice(0, 600),
      category,
      eventDate,
      salience: boostSalience(fact, salienceNum),
    });
  }
  return out.slice(0, 8);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Extract facts from a client message. The assistant reply is provided only as
 * disambiguation context; facts must describe what the client revealed.
 */
/** Short acknowledgements / greetings that never carry durable facts. */
const FACTLESS_RE =
  /^(спасибо[!.\s]*|благодарю[!.\s]*|привет[!.\s]*|здравствуй(те)?[!.\s]*|да[!.\s]*|нет[!.\s]*|ок(ей)?[!.\s]*|хорошо[!.\s]*|понятно[!.\s]*|ясно[!.\s]*|угу[!.\s]*|ага[!.\s]*|спс[!.\s]*)+$/i;

export async function extractFactsFromTurn(
  userMessage: string,
  assistantReply: string,
  knownFacts: string[] = []
): Promise<FactInput[]> {
  const user = userMessage?.trim();
  if (!user || user.length < 8) return [];
  // Skip the LLM call entirely for greetings/acknowledgements.
  if (user.length < 40 && FACTLESS_RE.test(user)) return [];

  const knownBlock = knownFacts.length
    ? `УЖЕ ИЗВЕСТНО О КЛИЕНТЕ (не повторяй, добавляй только новое или изменения):\n${knownFacts
        .slice(0, 12)
        .map((f) => `- ${f}`)
        .join("\n")}`
    : "";

  const userBlock = [
    `Реплика клиента: "${user.slice(0, 2000)}"`,
    assistantReply?.trim()
      ? `Контекст (ответ мастера, факты из него НЕ брать): "${assistantReply.trim().slice(0, 600)}"`
      : "",
    knownBlock,
  ]
    .filter(Boolean)
    .join("\n\n");

  const raw = await completeChat({
    messages: [
      { role: "system", content: buildExtractSystem(todayIso()) },
      { role: "user", content: userBlock },
    ],
    temperature: 0.1,
    maxTokens: 600,
    timeoutMs: 30000,
    skipTemperatureRetry: true,
  });
  if (!raw) return [];
  return parseFacts(raw);
}

export const USER_FACT_CATEGORIES = [
  "family",
  "work",
  "health",
  "money",
  "relationship",
  "event",
  "goal",
  "other",
] as const;

export type UserFactCategory = (typeof USER_FACT_CATEGORIES)[number];

function normalizeUserFactPhrase(fact: string): string {
  const trimmed = fact.trim();
  if (/^(у клиента|клиент)(\s|$)/i.test(trimmed)) return trimmed;
  if (/^я(\s|$)/i.test(trimmed)) {
    const rest = trimmed.replace(/^я\s*/i, "").trim();
    return rest ? `Клиент ${rest}` : trimmed;
  }
  if (/^у меня(\s|$)/i.test(trimmed)) {
    return `У клиента ${trimmed.replace(/^у меня\s*/i, "").trim()}`;
  }
  return `У клиента ${trimmed.charAt(0).toLowerCase()}${trimmed.slice(1)}`;
}

/** Validate and normalize a fact typed by the user in cabinet settings. */
export function validateUserSubmittedFact(
  raw: string,
  category?: string | null,
  eventDate?: string | null
): FactInput | null {
  const fact = normalizeUserFactPhrase(raw);
  if (!isQualityFact(fact)) return null;

  const cat =
    category && VALID_CATEGORIES.has(category) ? category : ("other" as UserFactCategory);

  const date =
    eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : null;

  return {
    fact: fact.slice(0, 600),
    category: cat,
    eventDate: date,
    salience: boostSalience(fact, 4),
    sourceCharacter: "user",
  };
}
