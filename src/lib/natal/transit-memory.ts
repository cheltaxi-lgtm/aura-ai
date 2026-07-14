import type { UserFact } from "@/lib/memory/user-facts";
import type { TransitHit } from "./transits";

/** Russian keyword hooks for correlating transits with stored user facts. */
export const TRANSIT_THEME_KEYWORDS: Record<string, string[]> = {
  sun: ["работ", "карьер", "цел", "отец", "здоров", "лидер"],
  moon: ["семь", "эмоци", "мать", "дом", "настроен"],
  mercury: ["учёб", "учеб", "общен", "договор", "переговор", "экзам"],
  venus: ["любов", "отношен", "брак", "партн", "свидан", "роман"],
  mars: ["конфликт", "спор", "энерги", "действ", "спорт", "соревн"],
  jupiter: ["рост", "удач", "путеш", "расшир", "возможност", "обучен"],
  saturn: ["карьер", "ответств", "огранич", "долг", "структур", "дисциплин"],
};

function matchFactsForPlanet(planetKey: string, facts: UserFact[]): UserFact[] {
  const keywords = TRANSIT_THEME_KEYWORDS[planetKey] ?? [];
  if (!keywords.length) return [];
  return facts.filter((f) => keywords.some((k) => f.fact.toLowerCase().includes(k))).slice(0, 2);
}

/** Prompt-only enrichment — never use in push notifications. */
export function enrichTransitsForPrompt(hits: TransitHit[], facts: UserFact[]): TransitHit[] {
  if (!facts.length) return hits;

  return hits.map((hit) => {
    const key = hit.planetKey ?? "";
    const matched = matchFactsForPlanet(key, facts);
    if (!matched.length) return hit;

    const snippets = matched.map((f) => f.fact.slice(0, 100));
    return {
      ...hit,
      kind: hit.kind === "aspect_hit" ? "memory_match" : hit.kind,
      relatedFacts: snippets,
      note: `${hit.note} · Память: ${snippets.join("; ")}`,
    };
  });
}

/** Safe notification text — strips memory snippets. */
export function transitNotificationNote(hit: TransitHit): string {
  const idx = hit.note.indexOf(" · Память:");
  return idx >= 0 ? hit.note.slice(0, idx) : hit.note;
}
