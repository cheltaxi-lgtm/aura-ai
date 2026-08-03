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
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { voiceTtsRuneCost } from "@/lib/rune-costs";
import { reportError } from "@/lib/error-report";

export const maxDuration = 300;

/** Hard cap — keeps provider spend bounded even with rune billing. */
const MAX_REQUEST_CHARS = 4000;

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

  try {
    const body = await request.json();
    text = String(body.text ?? "").trim();
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
  const unlimited = await resolveUnlimitedAccess({
    accountId: auth.sub,
    profileUserId,
  });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

  let billingCharge: BillingChargeResult | null = null;

  if (useRuneBilling && profileUserId) {
    const unit = runeCostFromSettings(runeSettings, "VOICE_TTS");
    const cost = voiceTtsRuneCost(text.length, unit);
    try {
      billingCharge = await BillingService.chargeForSession({
        userId: profileUserId,
        cost,
        actionType: "VOICE_TTS",
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return insufficientFundsResponse(err);
      }
      throw err;
    }
  }

  try {
    const result = await synthesizeSpeech(text, characterId);
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
      return NextResponse.json(
        { error: "Не удалось озвучить ответ", code: "browser_fallback" },
        { status: 502 }
      );
    }

    const headers: Record<string, string> = {
      "Cache-Control": "private, max-age=86400",
      "X-TTS-Provider": result.provider,
      ...(result.model ? { "X-TTS-Model": result.model } : {}),
      ...(result.chunks && result.chunks > 1 ? { "X-TTS-Chunks": String(result.chunks) } : {}),
      ...(billingCharge?.spentRunes
        ? { "X-TTS-Runes-Spent": String(billingCharge.spentRunes) }
        : {}),
    };

    if (result.parts && result.parts.length > 1) {
      return NextResponse.json(
        {
          parts: result.parts.map((part) => Buffer.from(part).toString("base64")),
          contentType: result.contentType,
          provider: result.provider,
          model: result.model,
          chunks: result.parts.length,
        },
        { status: 200, headers }
      );
    }

    return new NextResponse(result.buffer, {
      status: 200,
      headers: {
        ...headers,
        "Content-Type": result.contentType,
      },
    });
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
    return NextResponse.json(
      { error: "Озвучка временно недоступна", code: "browser_fallback" },
      { status: 500 }
    );
  }
}
