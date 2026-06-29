import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import type { ImageGenerateRequest, ImageSceneType } from "@/lib/image-prompts";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { spreadCardsKey } from "@/lib/spreads";
import { canPersistSceneUrl, persistSceneArtForSpread } from "@/lib/users";
import { normalizeSceneImageUrl } from "@/lib/scene-image-store";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";

const PERSISTABLE: ImageSceneType[] = [
  "zodiac_avatar",
  "tarot_atmosphere",
  "destiny_card",
  "final_report",
];

function isSceneType(value: string): value is ImageSceneType {
  return PERSISTABLE.includes(value as ImageSceneType);
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
  }

  let body: ImageGenerateRequest & { imageUrl?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const scene = String(body.scene ?? "");
  let imageUrl = String(body.imageUrl ?? "");
  if (!isSceneType(scene)) {
    return NextResponse.json({ error: "Invalid scene or imageUrl" }, { status: 400 });
  }

  imageUrl = await normalizeSceneImageUrl(imageUrl);
  if (!canPersistSceneUrl(imageUrl)) {
    return NextResponse.json({ error: "Invalid scene or imageUrl" }, { status: 400 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not linked" }, { status: 404 });
  }

  const cardsKey = spreadCardsKey(
    body.cards?.map(String),
    body.spreadId,
    "new"
  );

  const characterId = body.characterKey
    ? await resolveApiCharacterId(body.characterKey)
    : undefined;

  await persistSceneArtForSpread(profileUserId, scene, imageUrl, {
    cardsKey,
    characterId,
  });

  return NextResponse.json({ ok: true, scene, imageUrl });
}
