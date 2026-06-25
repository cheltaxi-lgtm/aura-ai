import { buildImagePrompt, type ImageGenerateRequest } from "@/lib/image-prompts";
import { openRouterAppHeaders } from "@/lib/brand";
import { isOpenRouterConfigured } from "@/lib/llm";
import { withLlmSlot } from "@/lib/llm-concurrency";
import { distillSceneVisualPrompt } from "@/lib/scene-visual-prompt";
import { getSetting, type ImageQuality, type VisualSettings } from "@/lib/settings";

const OPENROUTER_API = "https://openrouter.ai/api/v1/chat/completions";
const IMAGE_FETCH_TIMEOUT_MS = 60_000;

export interface GeneratedImage {
  imageUrl: string;
  model: string;
  scene: ImageGenerateRequest["scene"];
  aspectRatio: string;
  quality: ImageQuality;
}

function openRouterHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
    "Content-Type": "application/json",
    ...openRouterAppHeaders(),
  };
}

/** Seedream 4.5 on OpenRouter: flat $0.04/image — 1K and 2K same price; keep 1K for chat illustrations. */
function imageSizeFromQuality(quality: ImageQuality): "1K" | "2K" {
  return quality === "high" ? "2K" : "1K";
}

/** Seedream и часть моделей принимают только ["image"], Gemini — ["image","text"] */
function modalitiesForModel(model: string): ("image" | "text")[] {
  if (/seedream|flux|recraft|sourceful|riverflow|mai-image|grok-imagine/i.test(model)) {
    return ["image"];
  }
  return ["image", "text"];
}

function extractImageUrl(message: Record<string, unknown> | undefined): string | null {
  if (!message) return null;

  const images = message.images as
    | Array<{ image_url?: { url?: string }; imageUrl?: { url?: string } }>
    | undefined;

  if (Array.isArray(images) && images.length > 0) {
    const url = images[0]?.image_url?.url ?? images[0]?.imageUrl?.url;
    if (url) return url;
  }

  const parts = message.content as
    | Array<{ type?: string; image_url?: { url?: string } }>
    | string
    | undefined;

  if (Array.isArray(parts)) {
    for (const part of parts) {
      if (part.type === "image_url" && part.image_url?.url) {
        return part.image_url.url;
      }
    }
  }

  return null;
}

async function callOpenRouterImage(
  model: string,
  prompt: string,
  aspectRatio: string,
  quality: ImageQuality
): Promise<string | null> {
  return withLlmSlot(`image:${model}`, async () => {
  const response = await fetch(OPENROUTER_API, {
    method: "POST",
    headers: openRouterHeaders(),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      modalities: modalitiesForModel(model),
      image_config: {
        aspect_ratio: aspectRatio,
        image_size: imageSizeFromQuality(quality),
      },
    }),
    signal: AbortSignal.timeout(IMAGE_FETCH_TIMEOUT_MS),
  });

  const payload = (await response.json()) as {
    error?: { message?: string };
    choices?: Array<{ message?: Record<string, unknown> }>;
  };

  if (!response.ok) {
    console.warn("OpenRouter image failed:", model, response.status, payload.error?.message);
    return null;
  }

  return extractImageUrl(payload.choices?.[0]?.message);
  });
}

function resolveModelChain(settings: VisualSettings): string[] {
  const env = process.env.OPENROUTER_IMAGE_MODEL?.trim();
  const chain: string[] = [];
  if (env) chain.push(env);
  if (settings.model && !chain.includes(settings.model)) chain.push(settings.model);
  if (
    settings.fallbackEnabled &&
    settings.fallbackModel &&
    !chain.includes(settings.fallbackModel)
  ) {
    chain.push(settings.fallbackModel);
  }
  if (!chain.includes("bytedance-seed/seedream-4.5")) {
    chain.push("bytedance-seed/seedream-4.5");
  }
  if (!chain.includes("google/gemini-3.1-flash-image-preview")) {
    chain.push("google/gemini-3.1-flash-image-preview");
  }
  return chain;
}

export function isImageGenConfigured(): boolean {
  return isOpenRouterConfigured();
}

export async function generateSceneImage(
  params: ImageGenerateRequest
): Promise<GeneratedImage | null> {
  const visual = await getSetting("visual");
  if (!visual.enabled) return null;
  if (!visual.scenes[params.scene]) return null;
  if (!isOpenRouterConfigured()) return null;

  const built = buildImagePrompt(params, visual.stylePrefix);
  const quality =
    params.scene === "final_report" ? "high" : built.quality ?? visual.defaultQuality;

  let prompt = built.prompt;
  if (params.scene === "scene_illustration") {
    const distilled = await distillSceneVisualPrompt(
      params.userQuestionText,
      params.aiResponseText
    );
    if (distilled) {
      prompt = `${distilled}. Cinematic digital illustration, rich colors, storytelling composition, no text, no watermark`;
    }
  }

  for (const model of resolveModelChain(visual)) {
    const imageUrl = await callOpenRouterImage(
      model,
      prompt,
      built.aspectRatio,
      quality
    );
    if (imageUrl) {
      return {
        imageUrl,
        model,
        scene: params.scene,
        aspectRatio: built.aspectRatio,
        quality,
      };
    }
  }

  return null;
}
