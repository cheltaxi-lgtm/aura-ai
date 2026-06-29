import type { FactInput } from "@/lib/memory/user-facts";

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

const VALID_CATEGORIES = new Set<string>(USER_FACT_CATEGORIES);

const CYRILLIC_RE = /[а-яё]/i;

const CRITICAL_RE =
  /(развод|расстал|расхо|измен[аыу]|смерт|умер|похорон|онколог|\bрак\b|опухол|инсульт|инфаркт|операци|беремен|выкидыш|увол|сокращ|банкрот|долг|суд\b|иск\b|насили|депресс|суицид|зависим)/i;

const META_FACT_RE =
  /(карт[аыуои]?|таро|рун[аыуои]?|раскла|гадани|предсказ|астролог|гороскоп|зодиак|энерги|мастер|ассистент|assistant|tarot|card)/i;

export function boostFactSalience(fact: string, salience: number): number {
  if (CRITICAL_RE.test(fact)) return Math.max(salience, 5);
  return salience;
}

/** Shared quality gate for LLM extraction and user-submitted facts. */
export function isQualityMemoryFact(fact: string): boolean {
  const f = fact.trim();
  if (f.length < 6 || f.length > 600) return false;
  if (!CYRILLIC_RE.test(f)) return false;
  if (META_FACT_RE.test(f)) return false;
  return true;
}

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
  if (!isQualityMemoryFact(fact)) return null;

  const cat =
    category && VALID_CATEGORIES.has(category) ? category : ("other" as UserFactCategory);

  const date =
    eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : null;

  return {
    fact: fact.slice(0, 600),
    category: cat,
    eventDate: date,
    salience: boostFactSalience(fact, 4),
    sourceCharacter: "user",
  };
}

export function isValidFactCategory(category: string): boolean {
  return VALID_CATEGORIES.has(category);
}
