import type { AstroMeta, LifeFocus } from "@/lib/astro-profile";

export type CharacterKey = "ragnar" | "veronika" | "agafya" | "shri-raj" | "numerolog";

export interface SessionMemory {
  date: string;
  topicSummary: string;
  keyCards: string[];
  prediction: string;
  outcomeRating?: number;
  mood?: string;
}

export interface PromptUserContext {
  name: string;
  gender?: string;
  zodiac: string;
  birthDate: string;
  cards: string[] | ReadingCard[];
  sessionNumber?: number;
  today?: string;
  birthTime?: string;
  birthCity?: string;
  lifeFocus?: LifeFocus | string;
  mainQuestion?: string;
  astroMeta?: AstroMeta;
  isPaid?: boolean;
  memory?: SessionMemory[];
}

export interface ReadingCard {
  name: string;
  meaning: string;
}
