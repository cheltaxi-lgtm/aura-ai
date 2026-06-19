import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceImageGenRateLimit } from "@/lib/api-guards";
import { generateSceneImage, isImageGenConfigured } from "@/lib/image-gen";
import type { ImageGenerateRequest, ImageSceneType } from "@/lib/image-prompts";
import { sceneLabel } from "@/lib/image-prompts";
import { getSetting } from "@/lib/settings";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { tarotCardsKey } from "@/lib/tarot";
import { persistSceneArtForSpread, findExistingSceneArtUrl } from "@/lib/users";
import { normalizeSceneImageUrl } from "@/lib/scene-image-store";

export const maxDuration = 120;

const SCENES: ImageSceneType[] = [
  "zodiac_avatar",
  "tarot_atmosphere",
  "destiny_card",
  "scene_illustration",
  "final_report",
];

function isSceneType(value: string): value is ImageSceneType {
  return SCENES.includes(value as ImageSceneType);
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceImageGenRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

  const visual = await getSetting("visual");
  if (!visual.enabled) {
    return NextResponse.json({ error: "Image generation disabled", code: "disabled" }, { status: 503 });
  }

  if (!isImageGenConfigured()) {
    return NextResponse.json(
      { error: "Image generation not configured", code: "not_configured" },
      { status: 503 }
    );
  }

  let body: ImageGenerateRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const scene = String(body.scene ?? "");
  if (!isSceneType(scene)) {
    return NextResponse.json({ error: "Invalid scene type" }, { status: 400 });
  }

  if (!visual.scenes[scene]) {
    return NextResponse.json({ error: "Scene disabled in admin settings", code: "scene_off" }, { status: 403 });
  }

  if (scene === "final_report" && !body.isPaid) {
    return NextResponse.json(
      { error: "Final report requires paid access", code: "payment_required" },
      { status: 402 }
    );
  }

  if (scene === "zodiac_avatar" && !body.zodiac?.trim()) {
    return NextResponse.json({ error: "zodiac required for zodiac_avatar" }, { status: 400 });
  }

  if (scene === "scene_illustration" && !body.aiResponseText?.trim()) {
    return NextResponse.json({ error: "aiResponseText required for scene_illustration" }, { status: 400 });
  }

  try {
    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    const cardsKey =
      body.cards && body.cards.length >= 3
        ? tarotCardsKey(body.cards.slice(0, 3).map((name) => ({ name: String(name) })))
        : undefined;

    if (profileUserId && scene !== "scene_illustration") {
      const existingUrl = await findExistingSceneArtUrl(profileUserId, scene, cardsKey);
      if (existingUrl) {
        return NextResponse.json({
          imageUrl: existingUrl,
          scene,
          sceneLabel: sceneLabel(scene),
          reused: true,
        });
      }
    }

    const result = await generateSceneImage({ ...body, scene });
    if (!result) {
      return NextResponse.json({ error: "Image generation failed", code: "generation_failed" }, { status: 502 });
    }

    if (profileUserId && scene !== "scene_illustration") {
      try {
        const storableUrl = await normalizeSceneImageUrl(result.imageUrl);
        const patched = await persistSceneArtForSpread(profileUserId, scene, storableUrl, {
          cardsKey,
          characterId: body.characterKey ? String(body.characterKey) : undefined,
        });
        void patched;
        result.imageUrl = storableUrl;
      } catch (err) {
        console.warn("Scene art history save failed:", err);
      }
    }

    return NextResponse.json({
      imageUrl: result.imageUrl,
      scene: result.scene,
      sceneLabel: sceneLabel(result.scene),
      model: result.model,
      aspectRatio: result.aspectRatio,
      quality: result.quality,
    });
  } catch (error) {
    console.error("Image generate error:", error);
    return NextResponse.json({ error: "Image generation error" }, { status: 500 });
  }
}
