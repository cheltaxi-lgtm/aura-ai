import type { FactInput } from "@/lib/memory/user-facts";
import { isInstructionLikeFact } from "@/lib/memory/injection-guard";
import { normalizeUserFactPhrase } from "@/lib/memory/user-fact-display";

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
  if (isInstructionLikeFact(f)) return false;
  return true;
}

/** Validate and normalize a fact typed by the user in cabinet settings. */
export function validateUserSubmittedFact(
  raw: string,
  category?: string | null,
  eventDate?: string | null
): FactInput | null {
  const fact = normalizeUserFactPhrase(raw);
  if (!isQualityMemoryFact(fact)) return null;

  const cat: UserFactCategory =
    category && VALID_CATEGORIES.has(category)
      ? (category as UserFactCategory)
      : "other";

  const date =
    eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate) ? eventDate : null;

  const predicateKey = inferManualPredicate(fact, cat);
  const multi = [
    "family.child",
    "family.spouse",
    "health.condition",
    "health.procedure",
    "finance.debt",
    "event.upcoming",
  ].includes(predicateKey);

  return {
    fact: fact.slice(0, 600),
    category: cat,
    eventDate: date,
    salience: boostFactSalience(fact, 4),
    sourceCharacter: "user",
    sourceType: "user",
    predicateKey,
    operation: multi ? "add" : "replace",
    subjectKey: "client",
    allowSensitive: true,
  };
}

function inferManualPredicate(fact: string, cat: UserFactCategory): string {
  const f = fact.toLowerCase();
  if (cat === "work") {
    if (/ищу\s+работ|в\s+поиске\s+работ|безработ|хочу\s+смен/i.test(f)) {
      return "employment.searching";
    }
    return "employment.current";
  }
  if (cat === "family") {
    if (/муж|жена|супруг|партн[её]р/i.test(f)) return "family.spouse";
    if (/мама|папа|матер|отец|родител/i.test(f)) return "family.parent";
    if (/сын|доч|реб[её]н|дети|внук/i.test(f)) return "family.child";
    return "family.relative";
  }
  if (cat === "relationship") {
    if (/бывш|развод|расстал/i.test(f)) return "relationship.former_partner";
    return "relationship.status";
  }
  if (cat === "goal") return "goal.current";
  if (cat === "event") return "event.upcoming";
  if (cat === "health") return "health.condition";
  if (cat === "money") return "finance.debt";
  return "other";
}

export function isValidFactCategory(category: string): boolean {
  return VALID_CATEGORIES.has(category);
}
