import type { ImageGenerateRequest, ImageSceneType } from "@/lib/image-prompts";
import { spreadCardNamesForScene } from "@/lib/spreads";

const CACHE_PREFIX = "aura_scene_v1_";
const CLIENT_TIMEOUT_MS = 75_000;
const CACHEABLE: ImageSceneType[] = [
  "zodiac_avatar",
  "tarot_atmosphere",
  "destiny_card",
  "final_report",
];

function cacheKey(req: ImageGenerateRequest): string {
  const cards = req.cards?.join("|") ?? "";
  return `${CACHE_PREFIX}${req.scene}_${req.zodiac ?? ""}_${req.userName ?? ""}_${cards}_${req.characterKey ?? ""}`;
}

async function persistSceneImageClient(req: ImageGenerateRequest, imageUrl: string): Promise<void> {
  if (!imageUrl || typeof window === "undefined") return;
  try {
    await fetch("/api/image/persist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...req, imageUrl }),
    });
  } catch {
    /* ignore */
  }
}

export async function requestSceneImage(
  req: ImageGenerateRequest
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  const key = cacheKey(req);
  if (CACHEABLE.includes(req.scene)) {
    try {
      const cached = sessionStorage.getItem(key);
      if (cached) {
        void persistSceneImageClient(req, cached);
        return cached;
      }
    } catch {
      /* ignore */
    }
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);

    const res = await fetch("/api/image/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(req),
      signal: controller.signal,
    }).finally(() => clearTimeout(timer));

    if (!res.ok) return null;
    const data = (await res.json()) as { imageUrl?: string };
    const imageUrl = data.imageUrl ?? null;
    if (imageUrl && CACHEABLE.includes(req.scene)) {
      try {
        sessionStorage.setItem(key, imageUrl);
      } catch {
        /* quota */
      }
    }
    return imageUrl;
  } catch {
    return null;
  }
}

/** Card names for scene image prompts — supports 1–10 card spreads. */
export function tarotCardNames(
  cards: { name: string }[] | undefined,
  spreadId?: string | null,
  spreadType: "daily" | "new" = "daily"
): string[] | undefined {
  return spreadCardNamesForScene(cards, spreadId, spreadType);
}
