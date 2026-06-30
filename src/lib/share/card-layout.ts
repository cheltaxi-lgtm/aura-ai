export type ShareCardAspect = "story" | "og";

export const SHARE_CARD_DIMENSIONS: Record<ShareCardAspect, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  og: { width: 1200, height: 630 },
};

export function shareCardScale(aspect: ShareCardAspect, maxWidth: number): number {
  const { width } = SHARE_CARD_DIMENSIONS[aspect];
  return Math.min(1, maxWidth / width);
}
