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

/** Map spread intent slug to a follow-up ritual type, if any. */
export function recommendRitualForIntentSlug(slug: string): RitualType | null {
  if (RELEASE_SLUGS.has(slug)) return "release";
  if (MONEY_SLUGS.has(slug)) return "money";
  if (PROTECTION_SLUGS.has(slug)) return "protection";
  if (LUCK_SLUGS.has(slug)) return "luck";
  if (LOVE_SLUGS.has(slug)) return "love";
  return null;
}

export const RITUAL_PAGE_SLUGS: Record<RitualType, string> = {
  love: "pritjazhenie",
  money: "dostatok",
  protection: "zashchita",
  luck: "udacha",
  release: "otpustit",
};

export function ritualPageSlug(type: RitualType): string {
  return RITUAL_PAGE_SLUGS[type];
}
