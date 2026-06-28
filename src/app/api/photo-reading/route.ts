import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { requireUserAuth } from "@/lib/require-auth";
import { hasPaidAccess, saveMessage, updateSessionChatMeta, getSession } from "@/lib/session";
import { buildPhotoReadingUserMessage } from "@/lib/photo-chat";
import {
  generatePhotoInterpretation,
  photoReadingFallback,
  resolvePhotoInterpretationPrompt,
} from "@/lib/photo-reading-prompts";
import { createHistoryEntry } from "@/lib/users";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import {
  appendUserMemoryToPrompt,
  buildClientBlock,
  buildMemoryBlock,
} from "@/lib/user-memory";
import { loadClientMemoryBlock, recordTurn } from "@/lib/memory/client-memory";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { ensureChatSession } from "@/lib/session-access";
import { ensureSessionMemoryStub } from "@/lib/session-memory";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";
import {
  buildSpreadSummaryForLlm,
  isRecognizedSpread,
  isPhotoSpreadComplete,
  normalizeRedrawSpreadInput,
  redrawSpreadToTarotCards,
  type RedrawSpread,
} from "@/lib/photo-spread-redraw";

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

  try {
    const body = await request.json();
    characterId = await resolveApiCharacterId(body.characterId);
    question = sanitizeTextField(body.question, 500) ?? "";
    sessionId = body.sessionId;

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

  const spreadCheck = isRecognizedSpread({
    detectedCards: confirmedSpread.cards.map((c) => c.name),
    deckType: confirmedSpread.deckType,
    spreadType: confirmedSpread.spreadType,
  });
  if (!spreadCheck.ok) {
    return NextResponse.json({ error: "NOT_A_SPREAD", message: spreadCheck.reason }, { status: 422 });
  }

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

  if (useRuneBilling && profileUserId) {
    try {
      const charge = await BillingService.chargeRuneAction({
        userId: profileUserId,
        action: "VISION_ANALYSIS",
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
    gender: profile?.gender === "male" ? "Мужской" : profile?.gender === "female" ? "Женский" : undefined,
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

  const detectedCards = confirmedSpread.cards.map((c) =>
    c.reversed ? `${c.name} (перев.)` : c.name
  );
  const tarotCards = redrawSpreadToTarotCards(confirmedSpread);
  const spreadSummary = buildSpreadSummaryForLlm(confirmedSpread);

  try {
    let systemPrompt = await resolvePhotoInterpretationPrompt(characterId, ctx, referrerSlug);

    if (profileUserId && resolvedSessionId) {
      const clientBlock = buildClientBlock({
        name: ctx.userName,
        gender: ctx.gender,
        zodiac: ctx.zodiac,
        birthDate: ctx.birthDate,
      });
      const memoryBlock = await buildMemoryBlock(profileUserId, characterId, resolvedSessionId);
      const factsBlock = await loadClientMemoryBlock({ userId: profileUserId });
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

    if (profileUserId && (await ensureDb())) {
      const entry = await createHistoryEntry({
        userId: profileUserId,
        characterName: characterId,
        contextData: {
          type: "photo_reading",
          analysis: analysisBody,
          detectedCards,
          deckType: confirmedSpread.deckType,
          spreadType: confirmedSpread.spreadType,
          deckSystem: confirmedSpread.system,
          tarotCards,
          redrawSpread: confirmedSpread,
          question: question.trim() || undefined,
          userName: ctx.userName,
          sessionId: resolvedSessionId,
        },
        isPaid: isPaid || spentRunes > 0,
      });
      historyId = entry?.id;
    }

    if (resolvedSessionId && profileUserId && (await ensureDb())) {
      try {
        const userMsg = buildPhotoReadingUserMessage(question, detectedCards);
        await saveMessage(resolvedSessionId, characterId, "user", userMsg, profileUserId);
        await saveMessage(resolvedSessionId, characterId, "assistant", analysisBody, profileUserId);
        await updateSessionChatMeta(resolvedSessionId, {
          characterKey: characterId,
          spreadType: "photo",
          cards: detectedCards,
        });
        const topicSummary = question.trim()
          ? `Фото-расклад: ${question.trim().slice(0, 120)}`
          : "Фото-расклад";
        await ensureSessionMemoryStub({
          userId: profileUserId,
          sessionId: resolvedSessionId,
          characterKey: characterId,
          topicSummary,
          keyCards: detectedCards.slice(0, 5),
          prediction: analysisBody.slice(0, 500),
        });
      } catch (err) {
        console.warn("Photo reading chat save failed:", err);
      }
    }

    // Capture durable client facts from the free-text question (cross-section memory).
    if (profileUserId && question.trim()) {
      void recordTurn({
        userId: profileUserId,
        characterId,
        userMessage: question,
        assistantReply: analysisBody,
      }).catch((err) => console.warn("[memory] photo recordTurn failed:", err));
    }

    return NextResponse.json({
      analysis: analysisBody,
      detectedCards,
      deckType: confirmedSpread.deckType,
      spreadType: confirmedSpread.spreadType,
      deckSystem: confirmedSpread.system,
      redrawSpread: confirmedSpread,
      tarotCards,
      characterId,
      isPaid: isPaid || spentRunes > 0,
      saved: Boolean(profileUserId),
      historyId,
      sessionId: resolvedSessionId,
      runeBalance,
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
}
