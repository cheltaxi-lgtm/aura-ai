import type { ImageGenerateRequest } from "@/lib/image-prompts";
import { spreadCardNamesForScene } from "@/lib/spreads";

const CLIENT_TIMEOUT_MS = 75_000;

export async function requestSceneImage(
  req: ImageGenerateRequest
): Promise<string | null> {
  if (typeof window === "undefined") return null;

  // The server resolves the current owner and exact question/answer identity.
  // A browser cache can outlive both a reading and the signed-in account.
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
