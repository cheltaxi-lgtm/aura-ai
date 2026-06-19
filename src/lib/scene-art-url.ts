/** Same-origin relative path for scene art images. */
export function resolveSceneArtDisplayUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const pathname = url.startsWith("http") ? new URL(url).pathname : url.split("?")[0];
    const apiMatch = pathname.match(/\/api\/scene-art\/[\w-]+\.(jpg|jpeg|png|webp|gif)/i);
    if (apiMatch) return apiMatch[0];
    const legacyMatch = pathname.match(/\/scene-art\/[\w-]+\.(jpg|jpeg|png|webp|gif)/i);
    if (legacyMatch) return legacyMatch[0].replace("/scene-art/", "/api/scene-art/");
  } catch {
    /* ignore */
  }
  return url.replace(/\/scene-art\//, "/api/scene-art/");
}

export function toStoredSceneArtUrl(url: string): string {
  return resolveSceneArtDisplayUrl(url) ?? url;
}
