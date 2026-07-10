/**
 * Extracts durable, cross-master client facts from a chat turn using the main
 * chat model (DeepSeek via OpenRouter). Only stable, real-world facts about the
 * *client* are kept — the master's mystical interpretations, cards and small
 * talk are discarded. Output is normalized, quality-filtered Russian facts.
 */
import { completeChat } from "@/lib/llm";
import {
  boostFactSalience,
  isQualityMemoryFact,
  isValidFactCategory,
} from "@/lib/memory/user-fact-input";
import type { FactInput } from "@/lib/memory/user-facts";

export {
  USER_FACT_CATEGORIES,
  type UserFactCategory,
  validateUserSubmittedFact,
} from "@/lib/memory/user-fact-input";

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
    if (!isQualityMemoryFact(fact)) continue;

    const category =
      typeof item.category === "string" && isValidFactCategory(item.category)
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
      salience: boostFactSalience(fact, salienceNum),
    });
  }
  return out.slice(0, 8);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Fact extraction is a structured JSON extraction task (not creative writing),
 * yet it runs once per chat turn on the admin-configured *chat* model by
 * default — the same model users pay to talk to a master with. An optional
 * dedicated/cheaper model can be set for this background task specifically,
 * without touching the chat model settings.
 */
function extractModelOverride(): string | undefined {
  return process.env.MEMORY_EXTRACT_MODEL?.trim() || undefined;
}

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
    priority: "background",
    modelOverride: extractModelOverride(),
  });
  if (!raw) return [];
  return parseFacts(raw);
}
