import type { SpreadId } from "./types";

/** Curated spread depth for free-form «Свой вопрос» — not the full catalog. */
export const CUSTOM_QUESTION_SPREAD_TIERS: {
  id: SpreadId;
  tierLabel: string;
}[] = [
  { id: "triplet", tierLabel: "Короткий" },
  { id: "situation-5", tierLabel: "Глубокий" },
  { id: "celtic-cross", tierLabel: "Расширенный" },
];

export function listCustomQuestionSpreadIds(): SpreadId[] {
  return CUSTOM_QUESTION_SPREAD_TIERS.map((t) => t.id);
}
