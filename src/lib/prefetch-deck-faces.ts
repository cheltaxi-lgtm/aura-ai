import { deckImageSources, preferWebpDeckPath } from "@/lib/deck-image-url";
import { prefetchDeckFaceUrls } from "@/lib/deck-face-loader";

/** Start browser decode of deck faces before React paints confirm UI. */
export function prefetchDeckFaces(paths: Array<string | undefined | null>): void {
  if (typeof window === "undefined") return;
  const urls: string[] = [];
  for (const raw of paths) {
    const trimmed = raw?.trim();
    if (!trimmed || !trimmed.startsWith("/decks/")) continue;
    const { webp, fallback } = deckImageSources(trimmed);
    urls.push(preferWebpDeckPath(trimmed));
    if (fallback !== webp) urls.push(fallback);
  }
  prefetchDeckFaceUrls(urls);
}
