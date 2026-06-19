import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { hasPaidAccess, saveMessage } from "@/lib/session";
import { buildPhotoReadingUserMessage } from "@/lib/photo-chat";
import {
  generatePhotoInterpretation,
  photoReadingFallback,
  resolvePhotoReadingPrompt,
} from "@/lib/photo-reading-prompts";
import { createHistoryEntry } from "@/lib/users";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import {
  appendUserMemoryToPrompt,
  buildUserMemoryBlock,
} from "@/lib/user-memory";
import { canAfford, spendRunes, refundRunes } from "@/lib/rune-service";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { resolveSessionForUser } from "@/lib/session-access";
import { enforceChatRateLimit } from "@/lib/api-guards";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";
import {
  buildSpreadSummaryForLlm,
  isRecognizedSpread,
  normalizeRedrawSpreadInput,
  redrawSpreadToTarotCards,
  type RedrawSpread,
} from "@/lib/photo-spread-redraw";

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceChatRateLimit(auth.sub);
  if (rateLimited) return rateLimited;

  let spentRunes = 0;

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
  const profile = profileRow ? serializeUserProfile(profileRow) : null;

  let isPaid = false;
  let referrerSlug: string | null = null;

  const unlimited = profileUserId
    ? await resolveUnlimitedAccess({ accountId: auth.sub, profileUserId })
    : await resolveUnlimitedAccess({ accountId: auth.sub });

  if (await ensureDb()) {
    if (sessionId) {
      const resolved = await resolveSessionForUser(sessionId, profileUserId);
      if (resolved.error) return resolved.error;
      const session = resolved.session!;
      isPaid = hasPaidAccess(session, { unlimited });
      referrerSlug = session.referrer_slug;
    } else if (unlimited) {
      isPaid = true;
    }
  } else if (unlimited) {
    isPaid = true;
  }

  const runeSettings = await getRuneSettings();
  const useRuneBilling = Boolean(
    profileUserId && !unlimited && !isPaid && runeSettings.enabled
  );
  let runeBalance: number | undefined;

  if (useRuneBilling && profileUserId) {
    const affordCheck = await canAfford(profileUserId, "VISION_ANALYSIS");
    if (!affordCheck.allowed) {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_RUNES",
          balance: affordCheck.balance,
          required: affordCheck.cost,
          message: affordCheck.reason,
        },
        { status: 402 }
      );
    }
    const spendResult = await spendRunes(profileUserId, "VISION_ANALYSIS");
    if (!spendResult.success) {
      return NextResponse.json(
        {
          error: "INSUFFICIENT_RUNES",
          balance: affordCheck.balance,
          required: affordCheck.cost,
        },
        { status: 402 }
      );
    }
    runeBalance = spendResult.newBalance;
    spentRunes = runeCostFromSettings(runeSettings, "VISION_ANALYSIS");
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
    let systemPrompt = await resolvePhotoReadingPrompt(characterId, ctx, referrerSlug);

    if (profileUserId) {
      const memoryBlock = await buildUserMemoryBlock(profileUserId, {
        currentCharacterId: characterId,
      });
      systemPrompt = appendUserMemoryToPrompt(systemPrompt, memoryBlock);
    }

    const llmAnalysis = await generatePhotoInterpretation(
      systemPrompt,
      spreadSummary,
      question.trim() || undefined
    );
    const usedLlmFallback = !llmAnalysis;
    const analysisBody = llmAnalysis ?? photoReadingFallback(ctx.userName);

    if (usedLlmFallback && profileUserId && spentRunes > 0) {
      try {
        await refundRunes(
          profileUserId,
          spentRunes,
          "Возврат: пустой ответ LLM",
          "VISION_ANALYSIS"
        );
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
        },
        isPaid,
      });
      historyId = entry?.id;
    }

    if (sessionId && (await ensureDb())) {
      try {
        const userMsg = buildPhotoReadingUserMessage(question, detectedCards);
        await saveMessage(sessionId, characterId, "user", userMsg);
        await saveMessage(sessionId, characterId, "assistant", analysisBody);
      } catch (err) {
        console.warn("Photo reading chat save failed:", err);
      }
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
      isPaid,
      saved: Boolean(profileUserId),
      historyId,
      runeBalance,
    });
  } catch (error) {
    console.error("Photo reading error:", error);
    if (profileUserId && spentRunes > 0) {
      try {
        await refundRunes(
          profileUserId,
          spentRunes,
          "Возврат: ошибка анализа фото",
          "VISION_ANALYSIS"
        );
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
