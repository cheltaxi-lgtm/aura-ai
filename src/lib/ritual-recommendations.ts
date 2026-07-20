import type { RitualType } from "@/lib/ritual-config";

const RELEASE_SLUGS = new Set([
  "zhdat-ili-zabyt",
  "chto-otpustit",
  "kak-otpustit-cheloveka",
  "pauza-ili-konec",
  "ostatsya-ili-uyti",
]);

const MONEY_SLUGS = new Set([
  "na-dengi",
  "kuda-ukhodyat-dengi",
  "est-li-denezhnyy-blok",
  "denezhnyy-blok",
  "kak-uvelichit-dohod",
  "novyy-istochnik-dohoda",
  "stoit-li-brat-kredit",
]);

const PROTECTION_SLUGS = new Set(["nuzhna-li-zashchita", "kak-vernut-energiyu"]);

const LUCK_SLUGS = new Set(["kak-privlech-udachu"]);

const LOVE_SLUGS = new Set([
  "vernyotsya-li-on",
  "lyubit-li-on-menya",
  "chto-on-chuvstvuet",
  "chto-on-dumaet-obo-mne",
  "budem-li-my-vmeste",
]);

const HEALTH_SLUGS = new Set([
  "lenormand-zdorove",
  "situatsiya-so-zdorovem",
  "kak-vosstanovit-sily",
  "chto-s-moim-zdorovem",
]);

const CAREER_SLUGS = new Set([
  "novyy-proekt-uspeh",
  "budet-li-proekt-uspehen",
  "stoit-li-menyat-rabotu",
  "kak-proyti-sobesedovanie",
  "karera-i-prizvanie",
  "povyshenie-na-rabote",
]);

/** Map spread intent slug to a follow-up ritual type, if any. */
export function recommendRitualForIntentSlug(slug: string): RitualType | null {
  if (RELEASE_SLUGS.has(slug)) return "release";
  if (HEALTH_SLUGS.has(slug)) return "health";
  if (CAREER_SLUGS.has(slug)) return "career";
  if (MONEY_SLUGS.has(slug)) return "money";
  if (PROTECTION_SLUGS.has(slug)) return "protection";
  if (LUCK_SLUGS.has(slug)) return "luck";
  if (LOVE_SLUGS.has(slug)) return "love";
  // Heuristic fallback for catalog growth without hardcoding every slug.
  if (/zdorov|iscel|sily|son-i-zdorov/i.test(slug)) return "health";
  if (/rabot|karer|proekt|sobesed|uspeh-v-del|povyshen/i.test(slug)) return "career";
  return null;
}

export const RITUAL_PAGE_SLUGS: Record<RitualType, string> = {
  love: "pritjazhenie",
  money: "dostatok",
  protection: "zashchita",
  luck: "udacha",
  release: "otpustit",
  health: "isceleniye",
  career: "uspeh-v-delah",
};

export function ritualPageSlug(type: RitualType): string {
  return RITUAL_PAGE_SLUGS[type];
}
