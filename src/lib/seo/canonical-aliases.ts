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
  "/matrica-sudby": "/numerology/destiny-matrix",
  "/matrica-sudby-online": "/numerology/destiny-matrix",
  "/matrica-sudby-onlayn": "/numerology/destiny-matrix",
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
