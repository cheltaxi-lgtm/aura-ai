import type { SpreadId } from "@/lib/spreads";

const YES = ["Ответ"] as const;
const LOVE5 = ["Его мысли", "Его чувства", "Что скрыто", "Что мешает", "Итог"] as const;
const TRIPLET = ["Прошлое", "Настоящее", "Будущее"] as const;
const LOVE7 = [
  "Вы",
  "Партнёр",
  "Связь",
  "Сила пары",
  "Слабое место",
  "Совет",
  "Итог",
] as const;
const LEN5 = ["Основа", "Развитие", "Ядро", "Исход", "Ключ"] as const;

export type SpreadOverride = {
  spreadId: SpreadId;
  positions?: readonly string[];
  requiresPartnerInfo?: boolean;
};

/** Top ~50 high-traffic slugs → dedicated spread schemas (SEO + product). */
export const TOP_SPREAD_OVERRIDES: Record<string, SpreadOverride> = {
  // Love — feelings & person
  "chto-on-chuvstvuet": { spreadId: "love-7", positions: LOVE7, requiresPartnerInfo: true },
  "chto-on-dumaet-obo-mne": { spreadId: "love-7", positions: LOVE7, requiresPartnerInfo: true },
  "chto-on-skryvaet": { spreadId: "situation-5", positions: LOVE5 },
  "lyubit-li-on-menya": { spreadId: "yes-no", positions: YES },
  "est-li-u-nego-chuvstva": { spreadId: "yes-no", positions: YES },
  "chto-u-nego-na-serdce": { spreadId: "situation-5", positions: LOVE5 },
  // Love — return & contact
  "vernyotsya-li-on": { spreadId: "yes-no", positions: YES },
  "kogda-vernetsya": { spreadId: "triplet", positions: TRIPLET },
  "pozvonit-li-on": { spreadId: "yes-no", positions: YES },
  "napishut-li-on": { spreadId: "yes-no", positions: YES },
  "pochemu-on-molchit": { spreadId: "situation-5", positions: LOVE5 },
  "pochemu-propil": { spreadId: "situation-5", positions: LOVE5 },
  // Love — relationship
  "budem-li-my-vmeste": { spreadId: "love-7", positions: LOVE7, requiresPartnerInfo: true },
  "sovmestimost-pary": { spreadId: "love-7", positions: LOVE7, requiresPartnerInfo: true },
  "sovmestim-li-my": { spreadId: "triplet-love", positions: ["Вы", "Партнёр", "Перспектива"] },
  "chto-mezhdu-nami": { spreadId: "triplet-love", positions: ["Вы", "Партнёр", "Перспектива"] },
  "perspektiva-otnosheniy": { spreadId: "love-7", positions: LOVE7, requiresPartnerInfo: true },
  "est-li-izmena": { spreadId: "yes-no", positions: YES },
  "na-izmenu": { spreadId: "yes-no", positions: YES },
  "izmenshchik-li-on": { spreadId: "yes-no", positions: YES },
  // Love — breakup & choice
  "kak-otpustit-cheloveka": { spreadId: "situation-5", positions: LOVE5 },
  "pochemu-brosil": { spreadId: "situation-5", positions: LOVE5 },
  "pochemu-razlyubil": { spreadId: "situation-5", positions: LOVE5 },
  "ostatsya-ili-uyti": { spreadId: "yes-no", positions: YES },
  "zhdat-ili-zabyt": { spreadId: "yes-no", positions: YES },
  "pomirimsya-li-my": { spreadId: "yes-no", positions: YES },
  // Love — future & meeting
  "kak-nayti-lyubov": { spreadId: "triplet", positions: TRIPLET },
  "kto-moy-sudbenniy": { spreadId: "triplet", positions: TRIPLET },
  "kogda-vstrechu-lyubov": { spreadId: "triplet", positions: TRIPLET },
  "na-novoe-znakomstvo": { spreadId: "lenormand-line", positions: LEN5 },
  // Career & money
  "stoit-li-menyat-rabotu": { spreadId: "yes-no", positions: YES },
  "budet-li-povyshenie": { spreadId: "yes-no", positions: YES },
  "kak-proyti-sobesedovanie": { spreadId: "lenormand-line", positions: LEN5 },
  "stoit-li-uvolnyatsya": { spreadId: "yes-no", positions: YES },
  "kuda-ukhodyat-dengi": { spreadId: "situation-5", positions: ["Ситуация", "Препятствие", "Корень", "Совет", "Итог"] },
  "kak-uvelichit-dohod": { spreadId: "triplet", positions: TRIPLET },
  "budet-li-premiya": { spreadId: "yes-no", positions: YES },
  // Future
  "blizhayshee-budushchee": { spreadId: "triplet", positions: TRIPLET },
  "prognoz-na-mesyac": { spreadId: "triplet", positions: TRIPLET },
  "god-vpered": { spreadId: "year-ahead" },
  "chto-so-mnoy-proiskhodit": { spreadId: "situation-5" },
  "chto-menya-tormozit": { spreadId: "situation-5" },
  // Choice
  "pravilno-li-ya-postupayu": { spreadId: "yes-no", positions: YES },
  "stoit-li-pisat-pervoy": { spreadId: "yes-no", positions: YES },
  "napisat-li-pervoy": { spreadId: "yes-no", positions: YES },
  // Hero
  "sovmestimost-12": { spreadId: "compatibility-12", requiresPartnerInfo: true },
  "lenormand-liniya": { spreadId: "lenormand-line", positions: LEN5 },
  "karta-dnya": { spreadId: "single", positions: ["Послание"] },
  "moyo-prednaznachenie": { spreadId: "celtic-cross" },
};

export function applySpreadOverride<T extends { slug: string; spreadId: SpreadId; positions: readonly string[]; requiresPartnerInfo?: boolean }>(
  seed: T
): T {
  const ov = TOP_SPREAD_OVERRIDES[seed.slug];
  if (!ov) return seed;
  return {
    ...seed,
    spreadId: ov.spreadId,
    positions: ov.positions ?? seed.positions,
    requiresPartnerInfo: ov.requiresPartnerInfo ?? seed.requiresPartnerInfo,
  };
}
