/**
 * Maps alternate/duplicate keyword paths to a single canonical route.
 * Wired into next.config.ts `redirects()` as permanent (301) redirects, so
 * stray inbound links or accidentally-indexed variants consolidate onto one
 * URL instead of splitting ranking signal across near-duplicate pages.
 */
export const CANONICAL_ALIASES: Record<string, string> = {
  "/cards/masti/zhezly-znachenie": "/cards/masti/zhezly",
  "/cards/masti/mechi-znachenie": "/cards/masti/mechi",
  "/cards/masti/kubki-znachenie": "/cards/masti/kubki",
  "/cards/masti/pentakli-znachenie": "/cards/masti/pentakli",
  "/cards/masti/zhezly-taro": "/cards/masti/zhezly",
  "/cards/masti/mechi-taro": "/cards/masti/mechi",
  "/cards/masti/kubki-taro": "/cards/masti/kubki",
  "/cards/masti/pentakli-taro": "/cards/masti/pentakli",
  "/taro-online": "/taro",
  "/taro-onlayn": "/taro",
  "/gadanie-taro-online": "/taro",
  "/karty-taro": "/cards",
  "/znachenie-kart-taro": "/cards",
  "/starshie-arkany": "/cards/starshie-arkany",
  "/arkany-taro": "/cards/starshie-arkany",
  "/natalnaya-karta-online": "/natalnaya-karta",
  "/natalnaya-karta-onlayn": "/natalnaya-karta",
  "/raschet-natalnoy-karty": "/natalnaya-karta",
  "/natalnaya-karta-po-date-rozhdeniya": "/natalnaya-karta",
  "/natalnaya-karta-besplatno": "/natalnaya-karta",
  "/goroskop-rozhdeniya": "/natalnaya-karta",
  "/matrica-sudby": "/numerology/destiny-matrix",
  "/matrica-sudby-online": "/numerology/destiny-matrix",
  "/matrica-sudby-onlayn": "/numerology/destiny-matrix",
  "/matrica-sudby-po-date-rozhdeniya": "/numerology/destiny-matrix",
  "/matrica-sudby-besplatno": "/numerology/destiny-matrix",
  "/raschet-matricy-sudby": "/numerology/destiny-matrix",
  "/matrix-destiny": "/numerology/destiny-matrix",
  "/astrology": "/natalnaya-karta",
  "/bodigraf": "/dizayn-cheloveka/rasschitat",
  "/bodigraf-onlayn": "/dizayn-cheloveka/rasschitat",
  "/bodygraph": "/dizayn-cheloveka/rasschitat",
  "/taro-po-foto": "/photo-rasklad",
  "/rasshifrovka-taro-po-foto": "/photo-rasklad",
  "/aura-po-foto": "/aura",
  "/cvet-aury": "/aura/cveta",
  "/khiromantiya": "/gadanie-po-ladoni",
  "/chiromantiya": "/gadanie-po-ladoni",
  "/ladon": "/gadanie-po-ladoni",
  "/gadanie-po-ruke": "/gadanie-po-ladoni",
  "/gadanie-po-ladoni-online": "/gadanie-po-ladoni",
  "/gadanie-po-ladoni-onlayn": "/gadanie-po-ladoni",
  "/rasklady/chto-chuvstvuet-ona": "/rasklady/chto-ona-chuvstvuet",
};

export function resolveCanonicalPath(path: string): string {
  return CANONICAL_ALIASES[path] ?? path;
}

export function getCanonicalRedirects(): { source: string; destination: string; permanent: boolean }[] {
  return Object.entries(CANONICAL_ALIASES).map(([source, destination]) => ({
    source,
    destination,
    permanent: true,
  }));
}
