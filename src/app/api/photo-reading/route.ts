import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { requireUserAuth } from "@/lib/require-auth";
import { hasPaidAccess, getSession } from "@/lib/session";
import {
  generatePhotoInterpretation,
  photoReadingFallback,
  resolvePhotoInterpretationPrompt,
} from "@/lib/photo-reading-prompts";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import {
  appendUserMemoryToPrompt,
  buildClientBlock,
  buildMemoryBlock,
} from "@/lib/user-memory";
import { loadClientMemoryBlock } from "@/lib/memory/client-memory";
import { composeMemoryQueryText } from "@/lib/memory/memory-relevance";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { ensureChatSession } from "@/lib/session-access";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";
import {
  buildSpreadSummaryForLlm,
  isRecognizedSpread,
  isPhotoSpreadComplete,
  normalizeRedrawSpreadInput,
  redrawSpreadToTarotCards,
  type RedrawSpread,
} from "@/lib/photo-spread-redraw";
import { MAX_PHOTO_CARDS } from "@/lib/photo-reading-constants";
import { resolvePhotoReadingPricing } from "@/lib/photo-reading-billing";
import {
  buildPhotoSpreadKey,
  findPhotoReadingEntry,
  withPhotoReadingLock,
} from "@/lib/photo-reading-idempotency";
import {
  persistPhotoReadingResult,
  photoReadingJsonFromContext,
} from "@/lib/photo-reading-persist";

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "photo_reading");
  if (rateLimited) return rateLimited;

  let spentRunes = 0;
  let billingCharge: BillingChargeResult | null = null;

  let characterId = "veronika";
  let question = "";
  let sessionId: string | undefined;
  let confirmedSpread: RedrawSpread | null = null;
  let idempotencyKey: string | undefined;

  try {
    const body = await request.json();
    characterId = await resolveApiCharacterId(body.characterId);
    question = sanitizeTextField(body.question, 500) ?? "";
    sessionId = body.sessionId;
    idempotencyKey =
      request.headers.get("Idempotency-Key")?.trim() ||
      (typeof body.idempotencyKey === "string" ? body.idempotencyKey.trim() : undefined);

    if (body.confirmedSpread?.cards?.length) {
      confirmedSpread = normalizeRedrawSpreadInput(body.confirmedSpread, characterId);
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!confirmedSpread?.cards?.length) {
    return NextResponse.json(
      {
        error: "CONFIRMATION_REQUIRED",
        message: "Подтвердите перерисованный расклад перед расшифровкой.",
      },
      { status: 400 }
    );
  }

  if (!isPhotoSpreadComplete(confirmedSpread)) {
    return NextResponse.json(
      {
        error: "INCOMPLETE_SPREAD",
        message: "Расклад пуст — добавьте хотя бы один символ перед расшифровкой.",
      },
      { status: 422 }
    );
  }

  if (confirmedSpread.cards.length > MAX_PHOTO_CARDS) {
    return NextResponse.json(
      {
        error: "TOO_MANY_CARDS",
        message: `В раскладе не больше ${MAX_PHOTO_CARDS} символов.`,
      },
      { status: 422 }
    );
  }

  const spreadCheck = isRecognizedSpread({
    detectedCards: confirmedSpread.cards.map((c) => c.name),
    deckType: confirmedSpread.deckType,
    spreadType: confirmedSpread.spreadType,
  });
  if (!spreadCheck.ok) {
    return NextResponse.json({ error: "NOT_A_SPREAD", message: spreadCheck.reason }, { status: 422 });
  }

  const photoSpreadKey = buildPhotoSpreadKey(characterId, confirmedSpread, question);
  const lockKey = idempotencyKey || photoSpreadKey;

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  const profileRow = profileUserId ? await getUserById(profileUserId) : null;
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }
  const profile = serializeUserProfile(profileRow);

  let isPaid = false;
  let referrerSlug: string | null = null;
  let resolvedSessionId: string | undefined = sessionId;

  const unlimited = profileUserId
    ? await resolveUnlimitedAccess({ accountId: auth.sub, profileUserId })
    : await resolveUnlimitedAccess({ accountId: auth.sub });

  if (await ensureDb()) {
    if (profileUserId) {
      const ensured = await ensureChatSession(sessionId, profileUserId);
      if (ensured.error) return ensured.error;
      if (ensured.session) {
        resolvedSessionId = ensured.session.id;
        isPaid = hasPaidAccess(ensured.session, { unlimited });
        referrerSlug = ensured.session.referrer_slug;
      }
    } else if (sessionId) {
      const row = await getSession(sessionId);
      if (row) {
        isPaid = hasPaidAccess(row, { unlimited });
        referrerSlug = row.referrer_slug;
      }
    } else if (unlimited) {
      isPaid = true;
    }
  } else if (unlimited) {
    isPaid = true;
  }

  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);
  let runeBalance: number | undefined;
  let firstPhotoDiscount = false;

  if (profileUserId && (await ensureDb())) {
    const existing = await findPhotoReadingEntry(profileUserId, photoSpreadKey, idempotencyKey);
    if (existing && typeof existing.context_data.analysis === "string") {
      return NextResponse.json(
        photoReadingJsonFromContext(existing.context_data, {
          historyId: existing.id,
          runeBalance,
          cached: true,
        })
      );
    }
  }

  return withPhotoReadingLock(profileUserId ?? auth.sub, lockKey, async () => {
    if (profileUserId && (await ensureDb())) {
      const existing = await findPhotoReadingEntry(profileUserId, photoSpreadKey, idempotencyKey);
      if (existing && typeof existing.context_data.analysis === "string") {
        return NextResponse.json(
          photoReadingJsonFromContext(existing.context_data, {
            historyId: existing.id,
            runeBalance,
            cached: true,
          })
        );
      }
    }

    if (useRuneBilling && profileUserId) {
      try {
        const pricing = await resolvePhotoReadingPricing(profileUserId);
        firstPhotoDiscount = pricing.firstPhotoDiscount;
        const charge = await BillingService.chargeForSession({
          userId: profileUserId,
          cost: pricing.effectiveCost,
          actionType: "VISION_ANALYSIS",
          description: pricing.firstPhotoDiscount
            ? "Фото-расклад (первая скидка 50%)"
            : undefined,
        });
        billingCharge = charge;
        runeBalance = charge.newBalance;
        spentRunes = charge.spentRunes;
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          return insufficientFundsResponse(err);
        }
        throw err;
      }
    }

    const today = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const ctx = {
      userName: profile?.name ?? auth.name,
      gender:
        profile?.gender === "male"
          ? "Мужской"
          : profile?.gender === "female"
            ? "Женский"
            : undefined,
      zodiac: profile?.zodiac,
      birthDate: profile?.birthDate,
      birthTime: profile?.birthTime ?? undefined,
      birthCity: profile?.birthCity ?? undefined,
      lifeFocus: profile?.lifeFocus ?? undefined,
      mainQuestion: profile?.mainQuestion ?? undefined,
      astroMeta: profile?.astroMeta as import("@/lib/astro-profile").AstroMeta | undefined,
      today,
      isPaid,
      question,
    };

    const detectedCards = confirmedSpread!.cards.map((c) =>
      c.reversed ? `${c.name} (перев.)` : c.name
    );
    const tarotCards = redrawSpreadToTarotCards(confirmedSpread!);
    const spreadSummary = buildSpreadSummaryForLlm(confirmedSpread!);

    try {
      let systemPrompt = await resolvePhotoInterpretationPrompt(characterId, ctx, referrerSlug);

      if (profileUserId && resolvedSessionId) {
        const memoryQuery = composeMemoryQueryText({
          lastUserMessage: question,
          mainQuestion: ctx.mainQuestion,
        });
        const clientBlock = buildClientBlock(
          {
            name: ctx.userName,
            gender: ctx.gender,
            zodiac: ctx.zodiac,
            birthDate: ctx.birthDate,
            mainQuestion: ctx.mainQuestion,
            lifeFocus: ctx.lifeFocus,
          },
          memoryQuery
        );
        const memoryBlock = await buildMemoryBlock(
          profileUserId,
          characterId,
          resolvedSessionId,
          memoryQuery
        );
        const factsBlock = await loadClientMemoryBlock({
          userId: profileUserId,
          queryText: memoryQuery,
        });
        systemPrompt = appendUserMemoryToPrompt(
          systemPrompt,
          `${clientBlock}${memoryBlock}${factsBlock}`.trim() || null
        );
      }

      const llmAnalysis = await generatePhotoInterpretation(
        systemPrompt,
        spreadSummary,
        question.trim() || undefined
      );
      const usedLlmFallback = !llmAnalysis;
      const analysisBody = llmAnalysis ?? photoReadingFallback(ctx.userName);

      if (usedLlmFallback && profileUserId && billingCharge) {
        try {
          runeBalance = await BillingService.rollbackCharge({
            userId: profileUserId,
            cost: billingCharge.spentRunes,
            wasFreeQuestion: billingCharge.wasFreeQuestion,
            actionType: "VISION_ANALYSIS",
          });
          billingCharge = null;
          spentRunes = 0;
        } catch (refundErr) {
          console.error("Photo reading LLM fallback refund failed:", refundErr);
        }
      }

      let historyId: string | undefined;

      if (profileUserId && !usedLlmFallback && (await ensureDb())) {
        historyId = await persistPhotoReadingResult({
          profileUserId,
          characterId,
          analysisBody,
          detectedCards,
          confirmedSpread: confirmedSpread!,
          question,
          userName: ctx.userName ?? "друг",
          resolvedSessionId,
          isPaid,
          spentRunes,
          photoSpreadKey,
          idempotencyKey,
          firstPhotoDiscount,
        });
      }

      return NextResponse.json({
        analysis: analysisBody,
        detectedCards,
        deckType: confirmedSpread!.deckType,
        spreadType: confirmedSpread!.spreadType,
        deckSystem: confirmedSpread!.system,
        redrawSpread: confirmedSpread,
        tarotCards,
        characterId,
        isPaid: isPaid || spentRunes > 0,
        saved: Boolean(profileUserId) && !usedLlmFallback,
        historyId,
        sessionId: resolvedSessionId,
        runeBalance,
        firstPhotoDiscount,
      });
    } catch (error) {
      console.error("Photo reading error:", error);
      if (profileUserId && billingCharge) {
        try {
          await BillingService.rollbackCharge({
            userId: profileUserId,
            cost: billingCharge.spentRunes,
            wasFreeQuestion: billingCharge.wasFreeQuestion,
            actionType: "VISION_ANALYSIS",
          });
        } catch (refundErr) {
          console.error("Photo reading refund failed:", refundErr);
        }
      }
      return NextResponse.json(
        { error: "Не удалось расшифровать расклад. Руны возвращены на баланс." },
        { status: 500 }
      );
    }
  });
}
