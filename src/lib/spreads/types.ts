import type { DeckSystem } from "@/lib/decks/types";
import type { SessionTopicId } from "@/lib/session-topics";

export type SpreadId =
  | "triplet"
  | "single"
  | "situation-5"
  | "love-7"
  | "triplet-love"
  | "yes-no"
  | "celtic-cross"
  | "daily-extended";

export type SpreadLayout = "row" | "cross5" | "celtic10" | "grid" | "grid7";

export interface SpreadPosition {
  key: string;
  label: string;
  hint?: string;
}

export interface SpreadDefinition {
  id: SpreadId;
  label: string;
  description: string;
  cardCount: number;
  positions: SpreadPosition[];
  topics: SessionTopicId[] | "*";
  systems: DeckSystem[] | "*";
  costMultiplier: number;
  layout: SpreadLayout;
  access?: "free" | "registered" | "paid";
  seoSlug?: string;
  /** Shorter LLM blocks for 5+ cards */
  compactPrompt?: boolean;
}

export interface SpreadSettingsOverride {
  enabled?: boolean;
  costMultiplier?: number;
}

export interface SpreadCatalogSettings {
  spreadsCatalogEnabled: boolean;
  spreadOverrides: Partial<Record<SpreadId, SpreadSettingsOverride>>;
}

export const DEFAULT_SPREAD_CATALOG_SETTINGS: SpreadCatalogSettings = {
  spreadsCatalogEnabled: true,
  spreadOverrides: {},
};
