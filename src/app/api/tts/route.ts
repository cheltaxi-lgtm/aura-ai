import { NextRequest, NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { enforceTtsRateLimit } from "@/lib/api-guards";
import { isTtsConfigured, isTtsEnabled, synthesizeSpeech } from "@/lib/tts";
import { getSetting } from "@/lib/settings";
import { resolveApiCharacterId } from "@/lib/chat-sanitize";
import { isCharacterTtsEnabled } from "@/lib/voice-config";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  BillingIdempotencyConflictError,
  billingIdempotencyConflictResponse,
  readRequestChargeIdempotencyKey,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { createHash } from "node:crypto";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { voiceTtsRuneCost } from "@/lib/rune-costs";
import { reportError } from "@/lib/error-report";
import { withReadingLock } from "@/lib/reading-lock";
import { withActiveProfile } from "@/lib/active-profile";
import {
  getTtsResultCache,
  setTtsResultCache,
  ttsResultCacheKey,
  type CachedTtsResult,
} from "@/lib/tts-result-cache";

export const maxDuration = 300;

/** Hard cap — keeps provider spend bounded even with rune billing. */
const MAX_REQUEST_CHARS = 4000;
const inFlight = new Map<string, ReturnType<typeof synthesizeSpeech>>();

async function synthesizeOnce(key: string, text: string, characterId: string) {
  const prior = inFlight.get(key);
  if (prior) return prior;
  const pending = synthesizeSpeech(text, characterId);
  inFlight.set(key, pending);
  try { return await pending; }
  finally { if (inFlight.get(key) === pending) inFlight.delete(key); }
}

function ttsResponseFromCached(
  cached: CachedTtsResult,
  opts?: { spentRunes?: number; deduplicated?: boolean }
) {
  const headers: Record<string, string> = {
    "Cache-Control": "private, max-age=86400",
    "X-TTS-Provider": cached.provider,
    ...(cached.model ? { "X-TTS-Model": cached.model } : {}),
    ...(cached.parts && cached.parts.length > 1
      ? { "X-TTS-Chunks": String(cached.parts.length) }
      : {}),
    ...(opts?.spentRunes ? { "X-TTS-Runes-Spent": String(opts.spentRunes) } : {}),
    ...(opts?.deduplicated ? { "X-TTS-Deduplicated": "1" } : {}),
  };

  if (cached.parts && cached.parts.length > 1) {
    return NextResponse.json(
      {
        parts: cached.parts.map((part) => Buffer.from(part).toString("base64")),
        contentType: cached.contentType,
        provider: cached.provider,
        model: cached.model,
        chunks: cached.parts.length,
      },
      { status: 200, headers }
    );
  }

  return new NextResponse(new Uint8Array(cached.buffer), {
    status: 200,
    headers: {
      ...headers,
      "Content-Type": cached.contentType,
    },
  });
}

export async function GET() {
  const tts = await getSetting("tts");
  return NextResponse.json({
    enabled: tts.enabled === true,
    configured: isTtsConfigured(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceTtsRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

  if (!(await isTtsEnabled())) {
    return NextResponse.json(
      { error: "Озвучка отключена администратором", code: "disabled" },
      { status: 503 }
    );
  }

  if (!isTtsConfigured()) {
    return NextResponse.json(
      { error: "Озвучка временно недоступна", code: "browser_fallback" },
      { status: 503 }
    );
  }

  let text = "";
  let characterId = "veronika";
  let legacyKey: string | undefined;

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || typeof body.text !== "string" ||
        (body.characterId !== undefined && typeof body.characterId !== "string")) {
      return NextResponse.json({ error: "Некорректный текст для озвучки" }, { status: 400 });
    }
    text = body.text.trim();
    legacyKey = readRequestChargeIdempotencyKey(request, body);
    characterId = await resolveApiCharacterId(body.characterId ?? characterId);
  } catch {
    return NextResponse.json({ error: "Не удалось обработать запрос" }, { status: 400 });
  }

  if (!isCharacterTtsEnabled(characterId)) {
    return NextResponse.json(
      { error: "Озвучка для этого наставника недоступна", code: "browser_fallback" },
      { status: 403 }
    );
  }

  if (!text) {
    return NextResponse.json({ error: "Нет текста для озвучки" }, { status: 400 });
  }

  if (text.length > MAX_REQUEST_CHARS) {
    return NextResponse.json(
      {
        error: `Текст слишком длинный для озвучки (макс. ${MAX_REQUEST_CHARS} символов)`,
        code: "text_too_long",
        maxChars: MAX_REQUEST_CHARS,
      },
      { status: 400 }
    );
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) return NextResponse.json({ error: "Требуется активный профиль", code: "profile_required" }, { status: 409 });
  const unlimited = await resolveUnlimitedAccess({
    accountId: auth.sub,
    profileUserId,
  });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

  const unit = runeCostFromSettings(runeSettings, "VOICE_TTS");
  const cost = voiceTtsRuneCost(text.length, unit);
  const textDigest = createHash("sha256").update(text, "utf8").digest("hex").slice(0, 24);
  // Audio and its payment always bind to the normalized provider input.
  // A caller key cannot substitute a different text or voice into a purchase.
  const chargeIdemKey = `tts:${characterId}:${textDigest}`;
  const cacheKey = ttsResultCacheKey(profileUserId ?? auth.sub, chargeIdemKey);

  // Keep charge, provider outcome and any refund in one purchase sequence.
  // A retry cannot synthesize while a failed earlier attempt is being refunded.
  return withReadingLock(`tts:${cacheKey}`, async () => {
  let billingCharge: BillingChargeResult | null = null;
  const inactiveResponse = () => NextResponse.json({ error: "Профиль недоступен", code: "profile_inactive" }, { status: 409 });
  if (!(await withActiveProfile(profileUserId, async () => true))) return inactiveResponse();

  if (useRuneBilling && profileUserId) {
    try {
      billingCharge = await BillingService.chargeForSession({
        userId: profileUserId,
        cost,
        actionType: "VOICE_TTS",
        idempotencyKey: chargeIdemKey,
        operationIdentity: chargeIdemKey,
        legacyIdempotencyKeys: [`tts:${characterId}:${textDigest}:${cost}`, ...(legacyKey ? [legacyKey] : [])],
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return insufficientFundsResponse(err);
      }
      if (err instanceof BillingIdempotencyConflictError) return billingIdempotencyConflictResponse();
      if (err instanceof Error && ["billing_profile_inactive", "user_not_found"].includes(err.message)) return inactiveResponse();
      throw err;
    }
  }

  // Same-process hit: serve memory cache (incl. after charge dedupe).
  // Admission is bounded by the active-profile lock; never await network work
  // while holding that lock. Erasure accepted before admission denies synthesis.
  const admitted = await withActiveProfile(profileUserId, async () => {
    const cached = getTtsResultCache(cacheKey);
    return { cached, pending: cached ? undefined : synthesizeOnce(cacheKey, text, characterId)
      .then(value => ({ value }), error => ({ error })) };
  });
  if (!admitted) {
    if (billingCharge?.spentRunes) await BillingService.rollbackCharge({ userId: profileUserId, cost: billingCharge.spentRunes,
      wasFreeQuestion: false, actionType: "VOICE_TTS", transactionId: billingCharge.transactionId }).catch(() => undefined);
    return inactiveResponse();
  }
  const preexisting = admitted.cached;
  if (preexisting) {
    return ttsResponseFromCached(preexisting, {
      spentRunes: billingCharge?.spentRunes,
      deduplicated: billingCharge?.deduplicated,
    });
  }

  // Dedupe + empty process cache (other instance / reload): re-synthesize without
  // charging again — audio is not persisted in DB; provider cost ≪ rune price.
  try {
    const outcome = await admitted.pending!;
    if ("error" in outcome) throw outcome.error;
    const result = outcome.value;
    if (!result) {
      if (billingCharge?.spentRunes) {
        await BillingService.rollbackCharge({
          userId: profileUserId!,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: false,
          actionType: "VOICE_TTS",
          transactionId: billingCharge.transactionId,
        });
      }
      if (billingCharge?.deduplicated) {
        return NextResponse.json(
          { reuse: true, code: "tts_deduplicated" },
          {
            status: 200,
            headers: {
              "Cache-Control": "private, max-age=86400",
              "X-TTS-Deduplicated": "1",
            },
          }
        );
      }
      return NextResponse.json(
        { error: "Не удалось озвучить ответ", code: "browser_fallback" },
        { status: 502 }
      );
    }

    const cached: CachedTtsResult = {
      buffer: Buffer.from(result.buffer),
      contentType: result.contentType,
      provider: result.provider,
      model: result.model,
      parts: result.parts?.map((part) => Buffer.from(part)),
    };
    const delivery = await withActiveProfile(profileUserId, async () => {
      setTtsResultCache(cacheKey, cached);
      return ttsResponseFromCached(cached, {
      spentRunes: billingCharge?.spentRunes,
      deduplicated: billingCharge?.deduplicated,
      });
    });
    if (!delivery) {
      if (billingCharge?.spentRunes) await BillingService.rollbackCharge({ userId: profileUserId, cost: billingCharge.spentRunes,
        wasFreeQuestion: false, actionType: "VOICE_TTS", transactionId: billingCharge.transactionId }).catch(() => undefined);
      return inactiveResponse();
    }
    return delivery;
  } catch (error) {
    console.error("TTS error:", error);
    reportError(error, { route: "tts", characterId, chars: text.length });
    if (billingCharge?.spentRunes && profileUserId) {
      try {
        await BillingService.rollbackCharge({
          userId: profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: false,
          actionType: "VOICE_TTS",
          transactionId: billingCharge.transactionId,
        });
      } catch (refundErr) {
        console.error("TTS refund failed:", refundErr);
      }
    }
    if (billingCharge?.deduplicated) {
      return NextResponse.json(
        { reuse: true, code: "tts_deduplicated" },
        {
          status: 200,
          headers: {
            "Cache-Control": "private, max-age=86400",
            "X-TTS-Deduplicated": "1",
          },
        }
      );
    }
    return NextResponse.json(
      { error: "Озвучка временно недоступна", code: "browser_fallback" },
      { status: 500 }
    );
  }
  });
}
