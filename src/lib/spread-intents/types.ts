import type { SpreadId } from "@/lib/spreads";
import type { RuneActionType } from "@/lib/rune-costs";

export type SpreadIntentCategory =
  | "love"
  | "career"
  | "money"
  | "future"
  | "self"
  | "choice"
  | "family"
  | "ritual";

export const SPREAD_INTENT_CATEGORY_LABELS: Record<SpreadIntentCategory, string> = {
  love: "Любовь и отношения",
  career: "Карьера и работа",
  money: "Финансы",
  future: "Будущее и прогноз",
  self: "Самопознание",
  choice: "Выбор и решения",
  family: "Семья",
  ritual: "Обряды и энергия",
};

export interface SpreadIntentDefinition {
  slug: string;
  title: string;
  shortTitle?: string;
  description: string;
  category: SpreadIntentCategory;
  spreadId: SpreadId;
  recommendedMasterId: string;
  questionTemplate: string;
  seoTitle: string;
  seoDescription: string;
  h1: string;
  intro: string;
  positionsPreview: string[];
  relatedSlugs: string[];
  runeAction?: RuneActionType;
  isFeatured?: boolean;
}
