import { semanticResourceFingerprint } from "@/lib/reading-resource-identity";
import { buildImagePrompt, normalizeCharacterKey, type ImageGenerateRequest } from "@/lib/image-prompts";

/** Exact model intent, including full texts used by the scene prompt distiller. */
export function sceneImageResourceIdentity(body: ImageGenerateRequest, stylePrefix?: string): string {
  return `scene-image:${semanticResourceFingerprint({
    scene: body.scene, character: normalizeCharacterKey(body.characterKey) ?? null,
    userName: body.userName ?? null, zodiac: body.zodiac ?? null, cards: body.cards ?? [],
    spreadId: body.spreadId ?? null, question: body.userQuestionText ?? null,
    answer: body.aiResponseText ?? null, prompt: buildImagePrompt(body, stylePrefix),
  })}`;
}
