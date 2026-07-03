/** Prefer WebP deck assets when present; keep PNG as fallback path. */
export function deckImageSources(imagePath: string): { webp: string; fallback: string } {
  if (!imagePath.startsWith("/decks/") || !/\.png$/i.test(imagePath)) {
    return { webp: imagePath, fallback: imagePath };
  }
  return {
    webp: imagePath.replace(/\.png$/i, ".webp"),
    fallback: imagePath,
  };
}

export function preferWebpDeckPath(imagePath: string): string {
  return deckImageSources(imagePath).webp;
}
