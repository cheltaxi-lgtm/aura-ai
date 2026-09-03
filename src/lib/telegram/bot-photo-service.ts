/**
 * Photo-rasklad thin client for Telegram bot — same libs as /api/photo-reading/*.
 */
import { randomUUID } from "crypto";
import { isUserAgeEligible } from "@/lib/age-gate";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { MAX_IMAGE_BYTES, validateImageBase64Payload, validateImageMime } from "@/lib/api-guards";
import {
  deleteCabinetPhotoSpread,
  getCabinetPhotoSpreads,
  type CabinetPhotoSpreadRow,
} from "@/lib/cabinet-data";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";
import { ensureDb } from "@/lib/db";
import { resolveMasterDeckSystem } from "@/lib/decks";
import {
  getImageDimensionsFromBase64,
  isLandscapePhotoBase64,
  isWideOrSquarePhotoBase64,
} from "@/lib/image-dimensions";
import { buildMemoryContext, appendMemoryContextToPrompt } from "@/lib/memory/build-memory-context";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import { resolvePhotoReadingPricing } from "@/lib/photo-reading-billing";
import { MAX_PHOTO_CARDS, parseRecognitionConfidence } from "@/lib/photo-reading-constants";
import {
  buildPhotoSpreadKey,
  findPhotoReadingEntry,
  getPhotoChargeReuseState,
  withPhotoReadingLock,
} from "@/lib/photo-reading-idempotency";
import {
  persistPhotoReadingResult,
  photoReadingJsonFromContext,
} from "@/lib/photo-reading-persist";
import {
  generatePhotoRecognition,
  parsePhotoReadingResponse,
  resolvePhotoInterpretationPrompt,
  resolvePhotoRecognitionPrompt,
} from "@/lib/photo-reading-prompts";
import { createPhotoInterpretationJson } from "@/lib/photo-reading-stream";
import {
  buildSpreadSummaryForLlm,
  isPhotoSpreadComplete,
  isRecognizedSpread,
  isUnrecognizedCardLabel,
  mapDetectedToRedrawSpread,
  normalizeRedrawSpreadForMaster,
  normalizeRedrawSpreadInput,
  redrawSpreadToTarotCards,
  type RedrawSpread,
} from "@/lib/photo-spread-redraw";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { ensureChatSession } from "@/lib/session-access";
import { hasPaidAccess } from "@/lib/session";
import {
  BillingService,
  InsufficientFundsError,
} from "@/lib/services/billing-service";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";
import { getUserById, serializeUserProfile } from "@/lib/users";

function siteBase(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "https://zovus.ru").replace(/\/$/, "");
}

async function requirePhotoUser(telegramUserId: number) {
  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.accountId || !resolved.profileUserId) {
    return {
      ok: false as const,
      error: "needs_link" as const,
      message: "Привяжите аккаунт Zovus.",
      linkUrl: resolved.linkUrl,
    };
  }
  const user = await getUserById(resolved.profileUserId);
  if (!user || !isUserAgeEligible(user)) {
    return {
      ok: false as const,
      error: "needs_onboarding" as const,
      message: "Нужен подтверждённый возраст в профиле.",
      linkUrl: resolved.linkUrl,
    };
  }
  return { ok: true as const, resolved, user };
}

export async function botPhotoPricing(telegramUserId: number) {
  const gate = await requirePhotoUser(telegramUserId);
  if (!gate.ok) return gate;
  const pricing = await resolvePhotoReadingPricing(gate.resolved.profileUserId!);
  return {
    ok: true as const,
    action: "pricing" as const,
    ...pricing,
    runeBalance: gate.resolved.runeBalance,
    url: `${siteBase()}/photo-rasklad?utm_source=telegram&utm_medium=bot&utm_campaign=photo`,
  };
}

export async function botPhotoList(telegramUserId: number, limit = 12) {
  const gate = await requirePhotoUser(telegramUserId);
  if (!gate.ok) return gate;
  const rows = await getCabinetPhotoSpreads(gate.resolved.profileUserId!);
  const safeLimit = Math.min(20, Math.max(1, Math.floor(limit)));
  const pricing = await resolvePhotoReadingPricing(gate.resolved.profileUserId!);
  return {
    ok: true as const,
    action: "list" as const,
    cost: pricing.effectiveCost,
    firstPhotoDiscount: pricing.firstPhotoDiscount,
    runeBalance: gate.resolved.runeBalance,
    items: rows.slice(0, safeLimit).map((r) => {
      const ctx = r.contextData as CabinetPhotoSpreadRow["contextData"] & {
        sessionId?: string;
      };
      return {
        id: r.id,
        master: r.characterName,
        date: r.createdAt.slice(0, 10),
        question: (ctx.question || "").slice(0, 120),
        preview: (ctx.analysis || "").replace(/\s+/g, " ").trim().slice(0, 180),
        cards: (ctx.tarotCards || []).map((c) => c.name).slice(0, 12),
        sessionId: typeof ctx.sessionId === "string" ? ctx.sessionId : null,
      };
    }),
    url: `${siteBase()}/photo-rasklad?utm_source=telegram&utm_medium=bot&utm_campaign=photo`,
  };
}

export async function botPhotoGet(telegramUserId: number, historyId: string) {
  const gate = await requirePhotoUser(telegramUserId);
  if (!gate.ok) return gate;
  const id = historyId.trim();
  if (!id) {
    return { ok: false as const, error: "not_found" as const, message: "Расклад не найден." };
  }
  const rows = await getCabinetPhotoSpreads(gate.resolved.profileUserId!);
  const row = rows.find((r) => r.id === id);
  if (!row?.contextData.analysis?.trim()) {
    return { ok: false as const, error: "not_found" as const, message: "Расклад не найден." };
  }
  const ctx = row.contextData as CabinetPhotoSpreadRow["contextData"] & {
    sessionId?: string;
  };
  return {
    ok: true as const,
    action: "get" as const,
    historyId: row.id,
    master: row.characterName,
    question: ctx.question || "",
    analysis: ctx.analysis,
    cards: (ctx.tarotCards || []).map((c) => c.name),
    sessionId: typeof ctx.sessionId === "string" ? ctx.sessionId : null,
    url: `${siteBase()}/cabinet?utm_source=telegram&utm_medium=bot&utm_campaign=photo`,
  };
}

export async function botPhotoDelete(telegramUserId: number, historyId: string) {
  const gate = await requirePhotoUser(telegramUserId);
  if (!gate.ok) return gate;
  const deleted = await deleteCabinetPhotoSpread(gate.resolved.profileUserId!, historyId.trim());
  if (!deleted.ok) {
    return { ok: false as const, error: "not_found" as const, message: "Расклад не найден." };
  }
  return {
    ok: true as const,
    action: "delete" as const,
    message: "Фото-расклад удалён.",
  };
}

export async function botPhotoRecognize(input: {
  telegramUserId: number;
  imageBase64: string;
  mimeType?: string;
  characterId?: string;
  question?: string;
}) {
  const gate = await requirePhotoUser(input.telegramUserId);
  if (!gate.ok) return gate;

  const characterId = await resolveApiCharacterId(input.characterId || "veronika");
  const question = sanitizeTextField(input.question || "", 500) ?? "";
  let imageBase64 = (input.imageBase64 || "").replace(/^data:[^;]+;base64,/, "").trim();
  let mimeType = input.mimeType || "image/jpeg";

  if (!imageBase64) {
    return { ok: false as const, error: "invalid_image" as const, message: "Загрузите фото расклада." };
  }
  const rawSize = Math.ceil((imageBase64.length * 3) / 4);
  if (rawSize > MAX_IMAGE_BYTES) {
    return {
      ok: false as const,
      error: "invalid_image" as const,
      message: "Фото слишком большое (макс. 5 МБ).",
    };
  }
  const mimeErr = validateImageMime(mimeType);
  if (mimeErr) {
    return { ok: false as const, error: "invalid_image" as const, message: "Нужен JPEG, PNG или WebP." };
  }
  const imageErr = validateImageBase64Payload(imageBase64);
  if (imageErr) {
    return { ok: false as const, error: "invalid_image" as const, message: "Файл не похож на изображение." };
  }

  const profile = serializeUserProfile(gate.user);
  const today = new Date().toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const ctx = {
    userName: normalizePersonDisplayNameOr(profile?.name ?? gate.resolved.name, "друг"),
    gender:
      profile?.gender === "male" ? "Мужской" : profile?.gender === "female" ? "Женский" : undefined,
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
      return {
        ok: false as const,
        error: "vision_unavailable" as const,
        message: "Сервис распознавания временно недоступен. Попробуйте через минуту.",
      };
    }

    const parsed = parsePhotoReadingResponse(llmText, {
      landscapePhoto,
      horizontalRowSuspect,
    });
    const { deckType, spreadType } = parsed;
    const totalDetected = parsed.detectedCards.length;
    const truncated = totalDetected > MAX_PHOTO_CARDS;
    const detectedCards = truncated
      ? parsed.detectedCards.slice(0, MAX_PHOTO_CARDS)
      : parsed.detectedCards;
    const cardConfidences = truncated
      ? parsed.cardConfidences.slice(0, MAX_PHOTO_CARDS)
      : parsed.cardConfidences;
    const spreadCheck = isRecognizedSpread({ detectedCards, deckType, spreadType });
    const system = resolveMasterDeckSystem(characterId);

    if (!spreadCheck.ok) {
      const partialPairs = detectedCards
        .map((name, i) => ({ name, confidence: cardConfidences[i] ?? "unknown" }))
        .filter((p) => !isUnrecognizedCardLabel(p.name));
      if (!partialPairs.length) {
        return {
          ok: false as const,
          error: "not_a_spread" as const,
          message: spreadCheck.reason || "На фото не удалось увидеть расклад.",
          url: `${siteBase()}/?photo=1&utm_source=telegram&utm_medium=bot&utm_campaign=photo`,
        };
      }
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
      return {
        ok: true as const,
        action: "recognize" as const,
        redrawSpread,
        detectedCards: partialPairs.map((p) => p.name),
        deckType,
        spreadType,
        confidence: parseRecognitionConfidence(deckType),
        partial: true,
        message: spreadCheck.reason,
        characterId,
        question,
      };
    }

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

    return {
      ok: true as const,
      action: "recognize" as const,
      redrawSpread,
      detectedCards,
      deckType,
      spreadType,
      confidence: parseRecognitionConfidence(deckType),
      partial: false,
      truncated,
      characterId,
      question,
    };
  } catch (err) {
    console.error("[bot-photo] recognize", err);
    return {
      ok: false as const,
      error: "internal" as const,
      message: "Не удалось распознать расклад. Попробуйте другое фото.",
    };
  }
}

export async function botPhotoInterpret(input: {
  telegramUserId: number;
  confirmedSpread: RedrawSpread;
  characterId?: string;
  question?: string;
  idempotencyKey?: string;
}) {
  const gate = await requirePhotoUser(input.telegramUserId);
  if (!gate.ok) return gate;

  const profileUserId = gate.resolved.profileUserId!;
  const accountId = gate.resolved.accountId!;
  const characterId = await resolveApiCharacterId(input.characterId || "veronika");
  const question = sanitizeTextField(input.question || "", 500) ?? "";
  const confirmedSpread = normalizeRedrawSpreadInput(input.confirmedSpread, characterId);

  if (!confirmedSpread?.cards?.length || !isPhotoSpreadComplete(confirmedSpread)) {
    return {
      ok: false as const,
      error: "incomplete" as const,
      message: "Расклад пуст — нужна хотя бы одна карта.",
    };
  }
  if (confirmedSpread.cards.length > MAX_PHOTO_CARDS) {
    return {
      ok: false as const,
      error: "incomplete" as const,
      message: `В раскладе не больше ${MAX_PHOTO_CARDS} символов.`,
    };
  }
  const spreadCheck = isRecognizedSpread({
    detectedCards: confirmedSpread.cards.map((c) => c.name),
    deckType: confirmedSpread.deckType,
    spreadType: confirmedSpread.spreadType,
  });
  if (!spreadCheck.ok) {
    return {
      ok: false as const,
      error: "not_a_spread" as const,
      message: spreadCheck.reason || "Это не похоже на расклад.",
    };
  }

  const photoSpreadKey = buildPhotoSpreadKey(characterId, confirmedSpread, question);
  // Use the same normalized identity for the lock and the ledger. A missing
  // client key still needs to survive retries after a newly created session.
  const lockKey = input.idempotencyKey?.trim().slice(0, 80) || photoSpreadKey;
  const profile = serializeUserProfile(gate.user);
  const unlimited = await resolveUnlimitedAccess({ accountId, profileUserId });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(profileUserId, unlimited, runeSettings);

  return withPhotoReadingLock(profileUserId, lockKey, async () => {
    if (await ensureDb()) {
      const existing = await findPhotoReadingEntry(
        profileUserId,
        photoSpreadKey,
        input.idempotencyKey
      );
      if (existing && typeof existing.context_data.analysis === "string") {
        const payload = photoReadingJsonFromContext(existing.context_data, {
          historyId: existing.id,
          cached: true,
        });
        return {
          ok: true as const,
          action: "interpret" as const,
          analysis: payload.analysis as string,
          cards: (payload.detectedCards as string[]) || [],
          sessionId: (payload.sessionId as string) || null,
          historyId: existing.id,
          runeBalance: gate.resolved.runeBalance,
          charged: 0,
          cached: true,
          firstPhotoDiscount: Boolean(payload.firstPhotoDiscount),
        };
      }
    }

    let billingCharge: Awaited<ReturnType<typeof BillingService.chargeForSession>> | null = null;
    let spentRunes = 0;
    let chargedRunes = 0;
    let runeBalance = gate.resolved.runeBalance ?? undefined;
    let firstPhotoDiscount = false;
    let isPaid = false;
    let resolvedSessionId: string | undefined;

    if (await ensureDb()) {
      const ensured = await ensureChatSession(undefined, profileUserId);
      if (ensured.session) {
        resolvedSessionId = ensured.session.id;
        isPaid = hasPaidAccess(ensured.session, { unlimited });
      }
    }

    if (useRuneBilling) {
      try {
        const pricing = await resolvePhotoReadingPricing(profileUserId);
        firstPhotoDiscount = pricing.firstPhotoDiscount;
        billingCharge = await BillingService.chargeForSession({
          userId: profileUserId,
          cost: pricing.effectiveCost,
          actionType: "VISION_ANALYSIS",
          description: pricing.firstPhotoDiscount
            ? "Фото-расклад (первая скидка 50%)"
            : "Фото-расклад",
          sessionId: resolvedSessionId,
          // Prefer client/flow key — never a freshly minted session id.
          idempotencyKey: `tg-photo:${lockKey}`,
        });
        runeBalance = billingCharge.newBalance;
        spentRunes = billingCharge.spentRunes;
        chargedRunes = spentRunes;

        if (billingCharge.deduplicated) {
          const existingAfter = await findPhotoReadingEntry(
            profileUserId,
            photoSpreadKey,
            input.idempotencyKey
          );
          if (existingAfter && typeof existingAfter.context_data.analysis === "string") {
            const payload = photoReadingJsonFromContext(existingAfter.context_data, {
              historyId: existingAfter.id,
              cached: true,
            });
            return {
              ok: true as const,
              action: "interpret" as const,
              analysis: payload.analysis as string,
              cards: (payload.detectedCards as string[]) || [],
              sessionId: (payload.sessionId as string) || null,
              historyId: existingAfter.id,
              runeBalance,
              charged: 0,
              cached: true,
              firstPhotoDiscount: Boolean(payload.firstPhotoDiscount),
            };
          }
          const prior = billingCharge.transactionId
            ? await getPhotoChargeReuseState(profileUserId, billingCharge.transactionId)
            : null;
          if (!prior) throw new Error("photo_prior_charge_missing");
          if (!prior.refunded) {
            // The reading lock excludes another active attempt. Resume the
            // existing spend, including a failed retry, without another debit.
            billingCharge = {
              ...billingCharge,
              transactionId: prior.transactionId,
              spentRunes: prior.amount,
            };
          } else {
            billingCharge = await BillingService.chargeForSession({
              userId: profileUserId,
              cost: pricing.effectiveCost,
              actionType: "VISION_ANALYSIS",
              sessionId: resolvedSessionId,
              idempotencyKey: `${prior.retryPrefix}${randomUUID()}`,
            });
            if (billingCharge.deduplicated) throw new Error("photo_retry_charge_conflict");
            chargedRunes = billingCharge.spentRunes;
          }
          spentRunes = billingCharge.spentRunes;
          runeBalance = billingCharge.newBalance;
        }
      } catch (err) {
        if (err instanceof InsufficientFundsError) {
          return {
            ok: false as const,
            error: "insufficient_runes" as const,
            message: `Недостаточно рун: нужно ${err.required}, на балансе ${err.balance}.`,
            cost: err.required,
            runeBalance: err.balance,
            linkUrl: `${siteBase()}/cabinet?shop=1&utm_source=telegram&utm_medium=bot&utm_campaign=photo`,
          };
        }
        throw err;
      }
    }

    const today = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    const detectedCards = confirmedSpread.cards.map((c) =>
      c.reversed ? `${c.name} (перев.)` : c.name
    );
    const tarotCards = redrawSpreadToTarotCards(confirmedSpread);
    const spreadSummary = buildSpreadSummaryForLlm(confirmedSpread);
    const paidForPrompt = isPaid || spentRunes > 0 || Boolean(billingCharge) || unlimited;
    const ctx = {
      userName: normalizePersonDisplayNameOr(profile?.name ?? gate.resolved.name, "друг"),
      gender:
        profile?.gender === "male"
          ? "Мужской"
          : profile?.gender === "female"
            ? "Женский"
            : undefined,
      zodiac: profile?.zodiac,
      birthDate: profile?.birthDate ?? undefined,
      birthTime: profile?.birthTime ?? undefined,
      birthCity: profile?.birthCity ?? undefined,
      lifeFocus: profile?.lifeFocus ?? undefined,
      mainQuestion: question.trim() || profile?.mainQuestion || undefined,
      today,
      isPaid: paidForPrompt,
      question,
      tarotCards: tarotCards.map((c) => ({
        name: c.name,
        meaning: c.meaning || "",
        position: c.position,
      })),
    };

    try {
      let systemPrompt = await resolvePhotoInterpretationPrompt(characterId, ctx);
      const memoryCtx = await buildMemoryContext({
        userId: profileUserId,
        characterId,
        product: "photo",
        depth: "standard",
        sessionId: resolvedSessionId,
        profile: {
          name: ctx.userName,
          gender: ctx.gender,
          zodiac: ctx.zodiac,
          birthDate: ctx.birthDate,
          mainQuestion: ctx.mainQuestion,
          lifeFocus: ctx.lifeFocus,
        },
        lastUserMessage: question,
        mainQuestion: ctx.mainQuestion,
      });
      systemPrompt = appendMemoryContextToPrompt(systemPrompt, memoryCtx);

      const generated = await createPhotoInterpretationJson({
        systemPrompt,
        spreadSummary,
        question: question.trim() || undefined,
        userName: ctx.userName ?? "друг",
        cardCount: confirmedSpread.cards.length,
      });
      if (generated.llmFailed || !generated.reply.trim()) {
        throw new Error("photo_generation_failed");
      }

      const historyId = await persistPhotoReadingResult({
        profileUserId,
        characterId,
        analysisBody: generated.reply,
        detectedCards,
        confirmedSpread,
        question,
        userName: ctx.userName ?? "друг",
        resolvedSessionId,
        isPaid: isPaid || spentRunes > 0,
        spentRunes,
        photoSpreadKey,
        idempotencyKey: input.idempotencyKey,
        firstPhotoDiscount,
      });

      return {
        ok: true as const,
        action: "interpret" as const,
        analysis: generated.reply,
        cards: detectedCards,
        sessionId: resolvedSessionId ?? null,
        historyId: historyId ?? null,
        runeBalance,
        charged: chargedRunes,
        cached: false,
        firstPhotoDiscount,
      };
    } catch (err) {
      console.error("[bot-photo] interpret", err);
      let refunded = false;
      if (billingCharge) {
        try {
          const rollback = await BillingService.rollbackChargeEx({
            userId: profileUserId,
            cost: billingCharge.spentRunes,
            wasFreeQuestion: billingCharge.wasFreeQuestion,
            actionType: "VISION_ANALYSIS",
            transactionId: billingCharge.transactionId,
          });
          runeBalance = rollback.balance;
          refunded = rollback.refunded;
        } catch (refundError) {
          console.error("[bot-photo] refund", refundError);
        }
      }
      return {
        ok: false as const,
        error: "generation_failed" as const,
        message: refunded
          ? "Не удалось получить трактовку. Руны возвращены — попробуйте ещё раз."
          : "Не удалось получить трактовку. Проверьте статус оплаты в кабинете.",
        refunded,
        runeBalance,
      };
    }
  });
}

export async function botPhotoAction(input: {
  telegramUserId: number;
  action: "pricing" | "list" | "get" | "delete" | "recognize" | "interpret";
  historyId?: string;
  imageBase64?: string;
  mimeType?: string;
  characterId?: string;
  question?: string;
  confirmedSpread?: RedrawSpread;
  idempotencyKey?: string;
  limit?: number;
}) {
  switch (input.action) {
    case "pricing":
      return botPhotoPricing(input.telegramUserId);
    case "list":
      return botPhotoList(input.telegramUserId, input.limit);
    case "get":
      return botPhotoGet(input.telegramUserId, input.historyId || "");
    case "delete":
      return botPhotoDelete(input.telegramUserId, input.historyId || "");
    case "recognize":
      return botPhotoRecognize({
        telegramUserId: input.telegramUserId,
        imageBase64: input.imageBase64 || "",
        mimeType: input.mimeType,
        characterId: input.characterId,
        question: input.question,
      });
    case "interpret":
      if (!input.confirmedSpread?.cards?.length) {
        return {
          ok: false as const,
          error: "incomplete" as const,
          message: "Расклад пуст — нужна хотя бы одна карта.",
        };
      }
      return botPhotoInterpret({
        telegramUserId: input.telegramUserId,
        confirmedSpread: input.confirmedSpread,
        characterId: input.characterId,
        question: input.question,
        idempotencyKey: input.idempotencyKey,
      });
    default:
      return { ok: false as const, error: "invalid_action" as const, message: "Unknown action" };
  }
}
