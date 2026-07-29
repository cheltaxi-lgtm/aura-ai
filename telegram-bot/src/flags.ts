import { botConfig } from "./config.js";
import { flagEnabled } from "./db/repos.js";

/** Feature flags declared in config / seeded into bot_flags. */
export const FLAG_KEYS = [
  "bot_enabled",
  "day_card_enabled",
  "reminders_enabled",
  "ritual_reveal_enabled",
  "tts_enabled",
  "llm_enabled",
  "share_card_enabled",
  "weekly_digest_enabled",
] as const;

export type FlagKey = (typeof FLAG_KEYS)[number];

export function isBotEnabled(): boolean {
  return flagEnabled("bot_enabled", botConfig.flags.botEnabled);
}

export function isDayCardEnabled(): boolean {
  return flagEnabled("day_card_enabled", botConfig.flags.dayCardEnabled);
}

export function isRemindersEnabled(): boolean {
  return flagEnabled("reminders_enabled", botConfig.flags.remindersEnabled);
}

export function isRitualRevealEnabled(): boolean {
  return flagEnabled("ritual_reveal_enabled", botConfig.flags.ritualRevealEnabled);
}

export function isTtsEnabled(): boolean {
  return flagEnabled("tts_enabled", botConfig.flags.ttsEnabled);
}

export function isLlmEnabled(): boolean {
  return flagEnabled("llm_enabled", botConfig.flags.llmEnabled);
}

export function isShareCardEnabled(): boolean {
  return flagEnabled("share_card_enabled", botConfig.flags.shareCardEnabled);
}

/** Declared and seeded; no consumer yet (digest job not implemented). */
export function isWeeklyDigestEnabled(): boolean {
  return flagEnabled("weekly_digest_enabled", botConfig.flags.weeklyDigestEnabled);
}
