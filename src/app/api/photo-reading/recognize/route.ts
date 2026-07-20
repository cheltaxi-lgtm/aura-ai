import { NextRequest, NextResponse } from "next/server";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { requireUserAuth } from "@/lib/require-auth";
import {
  generatePhotoRecognition,
  parsePhotoReadingResponse,
  resolvePhotoRecognitionPrompt,
} from "@/lib/photo-reading-prompts";
import {
  getImageDimensionsFromBase64,
  isLandscapePhotoBase64,
  isWideOrSquarePhotoBase64,
} from "@/lib/image-dimensions";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { enforcePaidRouteRateLimit, MAX_IMAGE_BYTES, validateImageMime, validateImageBase64Payload } from "@/lib/api-guards";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import {
  isRecognizedSpread,
  isUnrecognizedCardLabel,
  mapDetectedToRedrawSpread,
  normalizeRedrawSpreadForMaster,
  redrawSpreadToTarotCards,
} from "@/lib/photo-spread-redraw";
import { resolveMasterDeckSystem } from "@/lib/decks";
import {
  MAX_PHOTO_CARDS,
  parseRecognitionConfidence,
} from "@/lib/photo-reading-constants";

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

  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "photo_recognize");
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
    userName: normalizePersonDisplayNameOr(profile?.name ?? auth.name, "друг"),
    gender: profile?.gender === "male" ? "Мужской" : profile?.gender === "female" ? "Женский" : undefined,
    zodiac: profile?.zodiac,
    birthDate: profile?.birthDate,
    question,
    today,
    isPaid: true,
  };

  try {
    const dims = getImageDimensionsFromBase64(imageBase64, mimeType);
    const landscapePhoto = isLandscapePhotoBase64(imageBase64, mimeType);
    const horizontalRowSuspect =
      landscapePhoto || isWideOrSquarePhotoBase64(imageBase64, mimeType) || dims == null;
    const systemPrompt = await resolvePhotoRecognitionPrompt(characterId, ctx);
    const recognitionUserText = question.trim()
      ? `Мой вопрос: ${question.trim()}. Определи колоду, схему расклада и все видимые карты/руны/символы.`
      : "Определи колоду, схему расклада и все видимые карты/руны/символы.";
    const llmText = await generatePhotoRecognition(
      systemPrompt,
      imageBase64,
      recognitionUserText,
      mimeType,
      { landscapePhoto }
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
    const parsed = parsePhotoReadingResponse(analysis, {
      landscapePhoto,
      horizontalRowSuspect,
    });
    const { deckType, spreadType } = parsed;
    /** The vision prompt caps itself at MAX_PHOTO_CARDS, but stay defensive in case a model overshoots — clamp upfront so what the user sees always matches what /stream will accept. */
    const totalDetected = parsed.detectedCards.length;
    const truncated = totalDetected > MAX_PHOTO_CARDS;
    const detectedCards = truncated ? parsed.detectedCards.slice(0, MAX_PHOTO_CARDS) : parsed.detectedCards;
    const cardConfidences = truncated
      ? parsed.cardConfidences.slice(0, MAX_PHOTO_CARDS)
      : parsed.cardConfidences;
    const overflowCards = truncated ? parsed.detectedCards.slice(MAX_PHOTO_CARDS) : [];
    const spreadCheck = isRecognizedSpread({ detectedCards, deckType, spreadType });

    if (!spreadCheck.ok) {
      const partialPairs = detectedCards
        .map((name, i) => ({ name, confidence: cardConfidences[i] ?? "unknown" }))
        .filter((p) => !isUnrecognizedCardLabel(p.name));
      if (partialPairs.length > 0) {
        const system = resolveMasterDeckSystem(characterId);
        const redrawSpread = normalizeRedrawSpreadForMaster(
          mapDetectedToRedrawSpread({
            detectedCards: partialPairs.map((p) => p.name),
            system,
            deckType,
            spreadType,
            confidences: partialPairs.map((p) => p.confidence),
          }),
          characterId
        );
        const confidence = parseRecognitionConfidence(deckType);
        return NextResponse.json({
          redrawSpread,
          tarotCards: redrawSpreadToTarotCards(redrawSpread),
          deckType,
          spreadType,
          detectedCards: partialPairs.map((p) => p.name),
          deckSystem: system,
          confidence,
          partial: true,
          truncated,
          totalDetected,
          overflowCards,
          message: spreadCheck.reason,
        });
      }

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
        confidences: cardConfidences,
      }),
      characterId
    );
    const confidence = parseRecognitionConfidence(deckType);

    console.info("[photo-recognize] ok", {
      userId: auth.sub,
      ms: Date.now() - startedAt,
      cards: detectedCards.length,
      confidence,
      truncated,
      landscapePhoto,
      horizontalRowSuspect,
      dims,
      reversedKept: detectedCards.filter((c) => /\(перев/i.test(c)).length,
    });

    return NextResponse.json({
      redrawSpread,
      tarotCards: redrawSpreadToTarotCards(redrawSpread),
      deckType,
      spreadType,
      detectedCards,
      deckSystem: system,
      confidence,
      partial: false,
      truncated,
      totalDetected,
      overflowCards,
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
