/** Shared policy, not a second balance. No expiry or product restrictions. */
export const STARTER_BONUS_RUNES = 40;
export const STARTER_BONUS_VERSION = "starter-40-v1";
/** Server-only evaluation; exposed to clients through /api/platform/features. */
export function isFirstExperienceEnabled(): boolean {
  return process.env.FIRST_EXPERIENCE_ENABLED === "true";
}
export function isReadingFollowupDeliveryEnabled(): boolean {
  return isFirstExperienceEnabled() && process.env.READING_FOLLOWUP_DELIVERY_ENABLED === "true";
}
