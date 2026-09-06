import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { isAgeGateCookieConfirmed } from "@/lib/age-gate-cookie";
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
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { clientIp, enforcePaidRouteRateLimit, MAX_IMAGE_BYTES, validateImageMime, validateImageBase64Payload } from "@/lib/api-guards";
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { resolvePhotoReadingPricing } from "@/lib/photo-reading-billing";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { reportError } from "@/lib/error-report";
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
import { isPhotoReadingEnabled } from "@/lib/settings";

export const maxDuration = 120;
const GUEST_RECOGNITION_CONCURRENCY = 4;
const REQUEST_BODY_OVERHEAD_BYTES = 256 * 1024;
const MAX_RECOGNITION_REQUEST_BYTES = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + REQUEST_BODY_OVERHEAD_BYTES;
let guestRecognitionInflight = 0;

class RequestBodyTooLargeError extends Error {}
class RequestBodyTimeoutError extends Error {}

function requestBodyTimeoutMs(): number {
  const configured = Number(process.env.PHOTO_RECOGNITION_BODY_TIMEOUT_MS ?? 45_000);
  return Number.isFinite(configured) ? Math.max(50, Math.min(120_000, Math.trunc(configured))) : 45_000;
}

async function readLimitedBody(request: NextRequest): Promise<Buffer> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isFinite(parsedLength) || parsedLength < 0) {
      throw new TypeError("invalid_content_length");
    }
    if (parsedLength > MAX_RECOGNITION_REQUEST_BYTES) {
      throw new RequestBodyTooLargeError("request_body_too_large");
    }
  }

  if (!request.body) return Buffer.alloc(0);
  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    void reader.cancel("request_body_timeout").catch(() => undefined);
  }, requestBodyTimeoutMs());
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (timedOut) throw new RequestBodyTimeoutError("request_body_timeout");
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RECOGNITION_REQUEST_BYTES) {
        await reader.cancel("request_body_too_large");
        throw new RequestBodyTooLargeError("request_body_too_large");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    clearTimeout(timeout);
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}

function guestBudgetPerDay(): number {
  const configured = Number(process.env.PHOTO_GUEST_RECOGNITION_DAILY_BUDGET ?? 200);
  return Number.isFinite(configured) ? Math.max(1, Math.min(5_000, Math.trunc(configured))) : 200;
}

function guestFingerprints(request: NextRequest): { device: string; ip: string } {
  const ip = clientIp(request);
  return {
    ip: createHash("sha256").update(ip).digest("hex").slice(0, 32),
    device: createHash("sha256")
      .update(`${ip}\0${request.headers.get("user-agent") ?? ""}`)
      .digest("hex")
      .slice(0, 32),
  };
}

async function enforceGuestIngressRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const fingerprint = guestFingerprints(request);
  const deviceBurst = await checkRateLimit(
    rateLimitKey("photo_guest_recognize_ingress_10m", fingerprint.device),
    12,
    10 * 60 * 1000
  );
  const ipBurst = deviceBurst.allowed
    ? await checkRateLimit(
        rateLimitKey("photo_guest_recognize_ingress_ip_hour", fingerprint.ip),
        60,
        60 * 60 * 1000
      )
    : deviceBurst;
  const blocked = !deviceBurst.allowed ? deviceBurst : !ipBurst.allowed ? ipBurst : null;
  if (!blocked) return null;
  return NextResponse.json(
    { error: "rate_limit", message: "Слишком много запросов. Подождите и попробуйте снова." },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfterSec ?? 600) } }
  );
}

async function enforceGuestRecognitionRateLimit(request: NextRequest): Promise<NextResponse | null> {
  const fingerprint = guestFingerprints(request);
  const hourly = await checkRateLimit(
    rateLimitKey("photo_guest_recognize_hour", fingerprint.device),
    3,
    60 * 60 * 1000
  );
  const daily = hourly.allowed
    ? await checkRateLimit(
        rateLimitKey("photo_guest_recognize_day", fingerprint.device),
        5,
        24 * 60 * 60 * 1000
      )
    : hourly;
  const ipDaily = daily.allowed
    ? await checkRateLimit(
        rateLimitKey("photo_guest_recognize_ip_day", fingerprint.ip),
        30,
        24 * 60 * 60 * 1000
      )
    : daily;
  const budget = ipDaily.allowed
    ? await checkRateLimit(
        rateLimitKey("photo_guest_recognize_budget", new Date().toISOString().slice(0, 10)),
        guestBudgetPerDay(),
        24 * 60 * 60 * 1000
      )
    : ipDaily;
  const blocked = !hourly.allowed
    ? hourly
    : !daily.allowed
      ? daily
      : !ipDaily.allowed
        ? ipDaily
        : !budget.allowed
          ? budget
          : null;
  if (!blocked) return null;
  return NextResponse.json(
    { error: "rate_limit", message: "Бесплатный просмотр уже использован. Войдите, чтобы продолжить разбор." },
    { status: 429, headers: { "Retry-After": String(blocked.retryAfterSec ?? 3600) } }
  );
}

/** Vision-only pass: guests get a rate-limited acquisition preview; billing stays in the authenticated interpretation. */
export async function POST(request: NextRequest) {
  if (!(await isPhotoReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const startedAt = Date.now();
  console.info("[photo-recognize] hit", {
    contentType: (request.headers.get("content-type") ?? "").slice(0, 64),
    contentLength: request.headers.get("content-length"),
  });
  const auth = await requireUserAuth();
  if (auth) {
    const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "photo_recognize");
    if (rateLimited) return rateLimited;
    const dailyLimited = await enforcePaidRouteRateLimit(auth.sub, "photo_recognize_daily");
    if (dailyLimited) return dailyLimited;
  } else if (!(await isAgeGateCookieConfirmed(request))) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  const actorId = auth?.sub ?? "guest";
  let guestSlotReserved = false;

  if (!auth) {
    const ingressLimited = await enforceGuestIngressRateLimit(request);
    if (ingressLimited) return ingressLimited;
    if (guestRecognitionInflight >= GUEST_RECOGNITION_CONCURRENCY) {
      return NextResponse.json(
        { error: "busy", message: "Сейчас много фото. Подождите несколько секунд и повторите." },
        { status: 429, headers: { "Retry-After": "10" } }
      );
    }
    guestRecognitionInflight += 1;
    guestSlotReserved = true;
  }

  try {
    let bufferedBody: Buffer;
    try {
      bufferedBody = await readLimitedBody(request);
    } catch (error) {
      if (error instanceof RequestBodyTooLargeError) {
        return NextResponse.json({ error: "Фото слишком большое (макс. 5 МБ)" }, { status: 413 });
      }
      if (error instanceof RequestBodyTimeoutError) {
        return NextResponse.json(
          { error: "Загрузка фото заняла слишком много времени. Попробуйте снова." },
          { status: 408, headers: { "Retry-After": "1" } }
        );
      }
      return NextResponse.json({ error: "Некорректный размер запроса" }, { status: 400 });
    }

    let characterId = "veronika";
    let imageBase64 = "";
    let mimeType = "image/jpeg";
    let question = "";

    const contentType = request.headers.get("content-type") ?? "";
    const bodyBytes = new Uint8Array(bufferedBody.length);
    bodyBytes.set(bufferedBody);
    const bufferedResponse = new Response(bodyBytes.buffer, {
      headers: { "content-type": contentType },
    });
    if (contentType.includes("multipart/form-data")) {
      try {
        const form = await bufferedResponse.formData();
      characterId = await resolveApiCharacterId(String(form.get("characterId") ?? "veronika"));
      question = sanitizeTextField(String(form.get("question") ?? ""), 500) ?? "";
      const file = form.get("image");
      if (!file || typeof file === "string") {
        return NextResponse.json({ error: "Загрузите фото расклада" }, { status: 400 });
      }
      const uploadFile = file as File;
      if (uploadFile.size > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Фото слишком большое (макс. 5 МБ)" }, { status: 413 });
      }
      const buf = Buffer.from(await uploadFile.arrayBuffer());
      imageBase64 = buf.toString("base64");
      mimeType = uploadFile.type || mimeType;
      console.info("[photo-recognize] multipart_received", {
        actor: actorId,
        fileBytes: buf.length,
        mimeType,
      });
      } catch (error) {
      console.error("[VISION_UPLOAD_ERROR]", {
        actor: actorId,
        stage: "multipart_parse",
        error,
      });
      return NextResponse.json({ error: "Invalid multipart body" }, { status: 400 });
      }
    } else {
      try {
        const rawBody: unknown = await bufferedResponse.json();
        if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
          return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const body = rawBody as Record<string, unknown>;
        characterId = await resolveApiCharacterId(
          typeof body.characterId === "string" ? body.characterId : "veronika"
        );
        imageBase64 = typeof body.imageBase64 === "string" ? body.imageBase64 : "";
        mimeType = typeof body.mimeType === "string" ? body.mimeType : mimeType;
        question = sanitizeTextField(body.question, 500) ?? "";
      } catch (error) {
      console.error("[VISION_UPLOAD_ERROR]", {
        actor: actorId,
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
      actor: actorId,
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
      actor: actorId,
      stage: "mime_validation",
      mimeType,
      imageBytes: rawSize,
    });
    return mimeErr;
  }
  const imageErr = validateImageBase64Payload(imageBase64);
  if (imageErr) {
    console.error("[VISION_UPLOAD_ERROR]", {
      actor: actorId,
      stage: "magic_validation",
      mimeType,
      imageBytes: rawSize,
    });
    return imageErr;
  }

  if (!auth) {
    const guestLimited = await enforceGuestRecognitionRateLimit(request);
    if (guestLimited) return guestLimited;
  }

  console.info("[photo-recognize] start", {
    actor: actorId,
    characterId,
    imageBytes: rawSize,
    mimeType,
  });

    let profile: ReturnType<typeof serializeUserProfile> | null = null;
    if (auth) {
    const profileUserId = await getProfileUserIdForAccount(auth.sub);
    const profileRow = profileUserId ? await getUserById(profileUserId) : null;
    if (!profileRow || !isUserAgeEligible(profileRow)) {
      return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
    }

    // Vision is not charged, but authenticated users must be able to afford the full interpretation.
    const unlimited = await resolveUnlimitedAccess({
      accountId: auth.sub,
      profileUserId,
    });
    const runeSettings = await getRuneSettings();
    if (isRuneBillingActive(profileUserId, unlimited, runeSettings) && profileUserId) {
      const pricing = await resolvePhotoReadingPricing(profileUserId);
      const balance = await getRuneBalance(profileUserId);
      if (balance < pricing.effectiveCost) {
        return insufficientRunesResponse(balance, pricing.effectiveCost);
      }
    }
      profile = serializeUserProfile(profileRow);
  }

  const today = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const ctx = {
    userName: normalizePersonDisplayNameOr(profile?.name ?? auth?.name, "друг"),
    gender: profile?.gender === "male" ? "Мужской" : profile?.gender === "female" ? "Женский" : undefined,
    zodiac: profile?.zodiac,
    birthDate: profile?.birthDate ?? undefined,
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
        actor: actorId,
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
      actor: actorId,
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
      guest: !auth,
    });
  } catch (error) {
    console.error("[VISION_UPLOAD_ERROR]", {
      actor: actorId,
      stage: "vision_or_parse",
      ms: Date.now() - startedAt,
      imageBytes: rawSize,
      mimeType,
      error,
    });
    reportError(error, {
      route: "photo-reading/recognize",
      userId: auth?.sub,
      characterId,
      imageBytes: rawSize,
    });
    return NextResponse.json(
      { error: "Не удалось распознать расклад. Попробуйте другое фото." },
      { status: 500 }
    );
    }
  } finally {
    if (guestSlotReserved) guestRecognitionInflight = Math.max(0, guestRecognitionInflight - 1);
  }
}
