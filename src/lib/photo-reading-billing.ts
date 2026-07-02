import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { countUserPhotoReadings } from "@/lib/photo-reading-idempotency";

/** 50% off the first completed photo reading for a user. */
export const FIRST_PHOTO_DISCOUNT_RATIO = 0.5;

export type PhotoReadingPricing = {
  baseCost: number;
  effectiveCost: number;
  firstPhotoDiscount: boolean;
  photoReadingsCount: number;
};

export async function resolvePhotoReadingPricing(userId: string): Promise<PhotoReadingPricing> {
  const settings = await getRuneSettings();
  const baseCost = runeCostFromSettings(settings, "VISION_ANALYSIS");
  const photoReadingsCount = await countUserPhotoReadings(userId);
  const firstPhotoDiscount = photoReadingsCount === 0;
  const effectiveCost = firstPhotoDiscount
    ? Math.max(1, Math.round(baseCost * FIRST_PHOTO_DISCOUNT_RATIO))
    : baseCost;

  return {
    baseCost,
    effectiveCost,
    firstPhotoDiscount,
    photoReadingsCount,
  };
}

export function photoReadingPricingFromSettings(
  photoReadingsCount: number,
  settings?: Awaited<ReturnType<typeof getRuneSettings>>
): PhotoReadingPricing {
  const baseCost = settings?.costs
    ? runeCostFromSettings(settings, "VISION_ANALYSIS")
    : DEFAULT_RUNE_COSTS.VISION_ANALYSIS;
  const firstPhotoDiscount = photoReadingsCount === 0;
  return {
    baseCost,
    effectiveCost: firstPhotoDiscount
      ? Math.max(1, Math.round(baseCost * FIRST_PHOTO_DISCOUNT_RATIO))
      : baseCost,
    firstPhotoDiscount,
    photoReadingsCount,
  };
}

export function defaultPhotoReadingBaseCost(): number {
  return DEFAULT_RUNE_COSTS.VISION_ANALYSIS;
}
