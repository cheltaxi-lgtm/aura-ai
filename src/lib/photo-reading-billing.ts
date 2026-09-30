import { DEFAULT_RUNE_COSTS } from "@/lib/rune-costs";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { countUserPhotoReadings } from "@/lib/photo-reading-idempotency";
import { FIRST_PHOTO_DISCOUNT_RATIO } from "@/lib/photo-reading-constants";

/** All completed photo readings have the same rune price. */
export { FIRST_PHOTO_DISCOUNT_RATIO } from "@/lib/photo-reading-constants";

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
  const firstPhotoDiscount = photoReadingsCount === 0 && FIRST_PHOTO_DISCOUNT_RATIO < 1;
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
  const firstPhotoDiscount = photoReadingsCount === 0 && FIRST_PHOTO_DISCOUNT_RATIO < 1;
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
