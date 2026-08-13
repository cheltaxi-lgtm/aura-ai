/**
 * Authenticated «3 карты дня» positions — not the guest-intro
 * Прошлое / Настоящее / Будущее triplet.
 * Keep in sync with EDITORIAL_DAILY_CARDS.benefits titles.
 */
export const DAILY_TRIPLET_POSITIONS = ["Главное", "Ресурс", "Осторожность"] as const;

export type DailyTripletPosition = (typeof DAILY_TRIPLET_POSITIONS)[number];
