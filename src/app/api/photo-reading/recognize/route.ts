import { NextRequest, NextResponse } from "next/server";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { requireUserAuth } from "@/lib/require-auth";
import {
  generatePhotoRecognition,
  parsePhotoReadingResponse,
  resolvePhotoReadingPrompt,
} from "@/lib/photo-reading-prompts";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { enforceChatRateLimit, MAX_IMAGE_BYTES, validateImageMime, validateImageBase64Payload } from "@/lib/api-guards";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";
import {
  isRecognizedSpread,
  mapDetectedToRedrawSpread,
  normalizeRedrawSpreadForMaster,
  redrawSpreadToTarotCards,
} from "@/lib/photo-spread-redraw";
import { resolveMasterDeckSystem } from "@/lib/decks";

export const maxDuration = 120;

/** Vision-only pass: recognize spread and build Aura redraw — billing gate, no persistence until interpret. */
export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  console.info("[photo-recognize] hit", {
    contentType: (request.headers.get("content-type") ?? "").slice(0, 64),
    contentLength: request.headers.get("content-length"),
  });
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

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("multipart/form-data")) {
    try {
      const form = await request.formData();
      characterId = await resolveApiCharacterId(String(form.get("characterId") ?? "veronika"));
      question = sanitizeTextField(String(form.get("question") ?? ""), 500) ?? "";
      const file = form.get("image");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Загрузите фото расклада" }, { status: 400 });
      }
      const uploadFile = file as File;
      const buf = Buffer.from(await uploadFile.arrayBuffer());
      imageBase64 = buf.toString("base64");
      mimeType = uploadFile.type || mimeType;
      console.info("[photo-recognize] multipart_received", {
        userId: auth.sub,
        fileBytes: buf.length,
        mimeType,
      });
    } catch (error) {
      console.error("[VISION_UPLOAD_ERROR]", {
        userId: auth.sub,
        stage: "multipart_parse",
        error,
      });
      return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
    }
  } else {
    try {
      const body = await request.json();
      characterId = await resolveApiCharacterId(body.characterId);
      imageBase64 = body.imageBase64 ?? "";
      mimeType = body.mimeType ?? mimeType;
      question = sanitizeTextField(body.question, 500) ?? "";
    } catch (error) {
      console.error("[VISION_UPLOAD_ERROR]", {
        userId: auth.sub,
        stage: "json_parse",
        error,
      });
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }
  }

  if (!imageBase64?.trim()) {
    return NextResponse.json({ error: "Загрузите фото расклада" }, { status: 400 });
  }

  const rawSize = Math.ceil((imageBase64.length * 3) / 4);
  if (rawSize > MAX_IMAGE_BYTES) {
    console.error("[VISION_UPLOAD_ERROR]", {
      userId: auth.sub,
      stage: "size_limit",
      imageBytes: rawSize,
      maxBytes: MAX_IMAGE_BYTES,
      mimeType,
    });
    return NextResponse.json({ error: "Фото слишком большое (макс. 5 МБ)" }, { status: 400 });
  }

  const mimeErr = validateImageMime(mimeType);
  if (mimeErr) {
    console.error("[VISION_UPLOAD_ERROR]", {
      userId: auth.sub,
      stage: "mime_validation",
      mimeType,
      imageBytes: rawSize,
    });
    return mimeErr;
  }
  const imageErr = validateImageBase64Payload(imageBase64);
  if (imageErr) {
    console.error("[VISION_UPLOAD_ERROR]", {
      userId: auth.sub,
      stage: "magic_validation",
      mimeType,
      imageBytes: rawSize,
    });
    return imageErr;
  }

  console.info("[photo-recognize] start", {
    userId: auth.sub,
    characterId,
    imageBytes: rawSize,
    mimeType,
  });

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  const profileRow = profileUserId ? await getUserById(profileUserId) : null;
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }
  const profile = serializeUserProfile(profileRow);

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

    if (!llmText) {
      console.error("[photo-recognize] vision_unavailable", {
        userId: auth.sub,
        ms: Date.now() - startedAt,
        imageBytes: rawSize,
      });
      return NextResponse.json(
        {
          error: "VISION_UNAVAILABLE",
          message: "Сервис распознавания временно недоступен. Попробуйте через минуту.",
        },
        { status: 503 }
      );
    }

    const analysis = llmText;
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

    const system = resolveMasterDeckSystem(characterId);
    const redrawSpread = normalizeRedrawSpreadForMaster(
      mapDetectedToRedrawSpread({
        detectedCards,
        system,
        deckType,
        spreadType,
      }),
      characterId
    );

    console.info("[photo-recognize] ok", {
      userId: auth.sub,
      ms: Date.now() - startedAt,
      cards: detectedCards.length,
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
    console.error("[VISION_UPLOAD_ERROR]", {
      userId: auth.sub,
      stage: "vision_or_parse",
      ms: Date.now() - startedAt,
      imageBytes: rawSize,
      mimeType,
      error,
    });
    return NextResponse.json(
      { error: "Не удалось распознать расклад. Попробуйте другое фото." },
      { status: 500 }
    );
  }
}
