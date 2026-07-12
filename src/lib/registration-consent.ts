import { buildAstroMeta } from "@/lib/astro-profile";

export interface AccountConsentSnapshot {
  termsAcceptedAt: string | null;
  ageConfirmedAt: string | null;
  marketingConsent: boolean;
  marketingConsentAt: string | null;
}

export function mergeConsentIntoAstroMeta(
  base: Record<string, unknown> | undefined,
  consent: AccountConsentSnapshot
): Record<string, unknown> {
  return {
    ...(base ?? {}),
    ageConfirmed: Boolean(consent.ageConfirmedAt),
    ...(consent.ageConfirmedAt ? { ageConfirmedAt: consent.ageConfirmedAt } : {}),
    marketingConsent: consent.marketingConsent,
    ...(consent.marketingConsent && consent.marketingConsentAt
      ? { marketingConsentAt: consent.marketingConsentAt }
      : {}),
  };
}

export function astroMetaFromBirthDate(
  birthDate: string,
  consent: AccountConsentSnapshot
): Record<string, unknown> | undefined {
  const base = buildAstroMeta(birthDate);
  if (!base) return undefined;
  return mergeConsentIntoAstroMeta(base as unknown as Record<string, unknown>, consent);
}
