import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import {
  generatePhotoRecognition,
  parsePhotoReadingResponse,
  photoReadingFallback,
  resolvePhotoReadingPrompt,
} from "@/lib/photo-reading-prompts";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { enforceChatRateLimit, MAX_IMAGE_BYTES, validateImageMime, validateImageBase64Payload } from "@/lib/api-guards";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";
import {
  isRecognizedSpread,
  mapDetectedToRedrawSpread,
  redrawSpreadToTarotCards,
  resolvePhotoDeckSystem,
} from "@/lib/photo-spread-redraw";

/** Vision-only pass: recognize spread and build Aura redraw — no billing, no persistence. */
export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceChatRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

  let characterId = "veronika";
  let imageBase64 = "";
  let mimeType = "image/jpeg";
  let question = "";

  try {
    const body = await request.json();
    characterId = await resolveApiCharacterId(body.characterId);
    imageBase64 = body.imageBase64 ?? "";
    mimeType = body.mimeType ?? mimeType;
    question = sanitizeTextField(body.question, 500) ?? "";
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!imageBase64?.trim()) {
    return NextResponse.json({ error: "Загрузите фото расклада" }, { status: 400 });
  }

  const rawSize = Math.ceil((imageBase64.length * 3) / 4);
  if (rawSize > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Фото слишком большое (макс. 5 МБ)" }, { status: 400 });
  }

  const mimeErr = validateImageMime(mimeType);
  if (mimeErr) return mimeErr;
  const imageErr = validateImageBase64Payload(imageBase64);
  if (imageErr) return imageErr;

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  const profileRow = profileUserId ? await getUserById(profileUserId) : null;
  const profile = profileRow ? serializeUserProfile(profileRow) : null;

  const today = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const ctx = {
    userName: profile?.name ?? auth.name,
    gender: profile?.gender === "male" ? "Мужской" : profile?.gender === "female" ? "Женский" : undefined,
    zodiac: profile?.zodiac,
    birthDate: profile?.birthDate,
    question,
    today,
    isPaid: true,
  };

  try {
    const systemPrompt = await resolvePhotoReadingPrompt(characterId, ctx);
    const llmText = await generatePhotoRecognition(
      systemPrompt,
      imageBase64,
      question.trim()
        ? `Мой вопрос: ${question.trim()}. Определи колоду, схему расклада и все видимые карты/руны/символы с ориентацией.`
        : "Определи колоду, схему расклада и все видимые карты/руны/символы с ориентацией.",
      mimeType
    );

    const analysis = llmText ?? photoReadingFallback(ctx.userName);
    const { deckType, spreadType, detectedCards } = parsePhotoReadingResponse(analysis);
    const spreadCheck = isRecognizedSpread({ detectedCards, deckType, spreadType });

    if (!spreadCheck.ok) {
      return NextResponse.json(
        {
          error: "NOT_A_SPREAD",
          message: spreadCheck.reason,
          detectedCards,
          deckType,
          spreadType,
        },
        { status: 422 }
      );
    }

    const system = resolvePhotoDeckSystem(deckType, characterId);
    const redrawSpread = mapDetectedToRedrawSpread({
      detectedCards,
      system,
      deckType,
      spreadType,
    });

    return NextResponse.json({
      redrawSpread,
      tarotCards: redrawSpreadToTarotCards(redrawSpread),
      deckType,
      spreadType,
      detectedCards,
      deckSystem: system,
    });
  } catch (error) {
    console.error("Photo recognition error:", error);
    return NextResponse.json(
      { error: "Не удалось распознать расклад. Попробуйте другое фото." },
      { status: 500 }
    );
  }
}
