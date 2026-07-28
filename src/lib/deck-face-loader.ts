/** Warm / remember deck faces. Never gate React paint on probes. */

const keepAlive = new Set<HTMLImageElement>();
const verified = new Set<string>();
const STORAGE_KEY = "zovus-deck-face-ok-v1";

function readStored(): void {
  if (typeof window === "undefined") return;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === "string" && item.startsWith("/decks/")) verified.add(item);
    }
  } catch {
    /* ignore */
  }
}

function writeStored(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...verified].slice(-240)));
  } catch {
    /* ignore */
  }
}

if (typeof window !== "undefined") readStored();

export function markDeckFaceVerified(url: string): void {
  const clean = url.split("?")[0] ?? url;
  verified.add(clean);
  verified.add(url);
  writeStored();
}

export function isDeckFaceVerified(url: string): boolean {
  if (verified.size === 0) readStored();
  const clean = url.split("?")[0] ?? url;
  return verified.has(clean) || verified.has(url);
}

/** Prefetch only — keeps Image() alive until load settles. */
export function prefetchDeckFaceUrls(urls: string[]): void {
  if (typeof window === "undefined") return;
  if (verified.size === 0) readStored();
  const seen = new Set<string>();
  for (const url of urls) {
    if (!url || seen.has(url) || verified.has(url)) continue;
    seen.add(url);
    const img = new window.Image();
    keepAlive.add(img);
    const done = () => {
      keepAlive.delete(img);
      if (img.naturalWidth > 0) markDeckFaceVerified(url);
    };
    img.onload = done;
    img.onerror = () => {
      keepAlive.delete(img);
    };
    img.decoding = "async";
    img.src = url;
  }
}
