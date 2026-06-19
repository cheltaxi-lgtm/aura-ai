import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import type { ImageGenerateRequest, ImageSceneType } from "@/lib/image-prompts";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { tarotCardsKey } from "@/lib/tarot";
import { canPersistSceneUrl, persistSceneArtForSpread } from "@/lib/users";
import { normalizeSceneImageUrl } from "@/lib/scene-image-store";

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

  const cardsKey =
    body.cards && body.cards.length >= 3
      ? tarotCardsKey(body.cards.slice(0, 3).map((name) => ({ name: String(name) })))
      : undefined;

  await persistSceneArtForSpread(profileUserId, scene, imageUrl, {
    cardsKey,
    characterId: body.characterKey ? String(body.characterKey) : undefined,
  });

  return NextResponse.json({ ok: true, scene, imageUrl });
}
