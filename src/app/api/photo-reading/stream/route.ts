import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { AGE_REQUIRED_ERROR, isUserAgeEligible } from "@/lib/age-gate";
import { requireUserAuth } from "@/lib/require-auth";
import { hasPaidAccess, getSession } from "@/lib/session";
import { resolvePhotoInterpretationPrompt } from "@/lib/photo-reading-prompts";
import {
  createPhotoInterpretationJson,
  createPhotoInterpretationStream,
} from "@/lib/photo-reading-stream";
import { getUserById, serializeUserProfile } from "@/lib/users";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { buildMemoryContext, appendMemoryContextToPrompt } from "@/lib/memory/build-memory-context";
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
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
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
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  beginWorkerJobSave,
  trackWorkerJobCharged,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";

export const maxDuration = 180;

export async function POST(request: NextRequest) {
  const workerUserId = getAsyncJobWorkerUserId(request);
  let accountId: string;
  let accountName: string | undefined;

  if (workerUserId) {
    accountId = workerUserId;
  } else {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json(
        { error: "Требуется регистрация", code: "auth_required" },
        { status: 401 }
      );
    }
    accountId = auth.sub;
    accountName = auth.name;
    const rateLimited = await enforcePaidRouteRateLimit(auth.sub, "photo_reading");
    if (rateLimited) return rateLimited;
  }

  let billingCharge: BillingChargeResult | null = null;
  let spentRunes = 0;

  let characterId = "veronika";
  let question = "";
  let sessionId: string | undefined;
  let confirmedSpread: RedrawSpread | null = null;
  let idempotencyKey: string | undefined;
  let asyncRequested = false;
  let rawBody: Record<string, unknown> = {};

  try {
    const body = await request.json();
    rawBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    asyncRequested = body.async === true;
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

  const profileUserId = workerUserId
    ? workerUserId
    : await getProfileUserIdForAccount(accountId);
  const profileRow = profileUserId ? await getUserById(profileUserId) : null;
  if (!profileRow || !isUserAgeEligible(profileRow)) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }
  const profile = serializeUserProfile(profileRow);

  if (asyncRequested && isAsyncJobWorkerConfigured() && !workerUserId) {
    if (!profileUserId) {
      return NextResponse.json(
        { error: "Требуется регистрация", code: "auth_required" },
        { status: 401 }
      );
    }
    return enqueuePaidAsyncJob({
      userId: profileUserId,
      kind: "photo_reading",
      payload: {
        ...rawBody,
        async: false,
        photoSpreadKey,
        idempotencyKey,
      },
      bypassDeliveryGate: true,
    });
  }

  // Worker / durable path always returns JSON (no SSE).
  const preferJson = Boolean(workerUserId);

  let isPaid = false;
  let referrerSlug: string | null = null;
  let resolvedSessionId: string | undefined = sessionId;

  const unlimited = profileUserId
    ? await resolveUnlimitedAccess({ accountId, profileUserId })
    : await resolveUnlimitedAccess({ accountId });

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
      const payload = photoReadingJsonFromContext(existing.context_data, {
        historyId: existing.id,
        runeBalance,
        cached: true,
      });
      await trackWorkerJobCompleted(request, payload);
      return NextResponse.json(payload);
    }
  }

  return withPhotoReadingLock(profileUserId ?? accountId, lockKey, async () => {
    if (profileUserId && (await ensureDb())) {
      const existing = await findPhotoReadingEntry(profileUserId, photoSpreadKey, idempotencyKey);
      if (existing && typeof existing.context_data.analysis === "string") {
        const payload = photoReadingJsonFromContext(existing.context_data, {
          historyId: existing.id,
          runeBalance,
          cached: true,
        });
        await trackWorkerJobCompleted(request, payload);
        return NextResponse.json(payload);
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
          sessionId,
          idempotencyKey:
            idempotencyKey ||
            (sessionId ? `photo-reading:${sessionId}` : undefined),
        });
        billingCharge = charge;
        runeBalance = charge.newBalance;
        spentRunes = charge.spentRunes;
        await trackWorkerJobCharged(request, charge.transactionId);

        // Dedupe under lock: never re-run vision — return cached analysis or pending resume.
        if (charge.deduplicated) {
          const existingAfterCharge = await findPhotoReadingEntry(
            profileUserId,
            photoSpreadKey,
            idempotencyKey
          );
          if (existingAfterCharge && typeof existingAfterCharge.context_data.analysis === "string") {
            const payload = photoReadingJsonFromContext(existingAfterCharge.context_data, {
              historyId: existingAfterCharge.id,
              runeBalance,
              cached: true,
            });
            await trackWorkerJobCompleted(request, payload);
            return NextResponse.json(payload);
          }
          const pendingPayload = {
            pending: true,
            reused: true,
            sessionId: sessionId ?? null,
            runeBalance,
            message: "Фото-разбор уже выполняется — откройте сессию.",
          };
          await trackWorkerJobCompleted(request, pendingPayload);
          return NextResponse.json(pendingPayload);
        }
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

    const detectedCards = confirmedSpread!.cards.map((c) =>
      c.reversed ? `${c.name} (перев.)` : c.name
    );
    const tarotCards = redrawSpreadToTarotCards(confirmedSpread!);
    const spreadSummary = buildSpreadSummaryForLlm(confirmedSpread!);
    /** Rune charge / unlimited / session access — treat as paid for full reading depth. */
    const paidForPrompt = isPaid || spentRunes > 0 || Boolean(billingCharge) || unlimited;

    const ctx = {
      userName: normalizePersonDisplayNameOr(profile?.name ?? accountName, "друг"),
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
      mainQuestion: question.trim() || profile?.mainQuestion || undefined,
      astroMeta: profile?.astroMeta as import("@/lib/astro-profile").AstroMeta | undefined,
      today,
      isPaid: paidForPrompt,
      question,
      tarotCards: tarotCards.map((c) => ({
        name: c.name,
        meaning: c.meaning || "",
        position: c.position,
      })),
    };

    let systemPrompt = await resolvePhotoInterpretationPrompt(characterId, ctx, referrerSlug);

    if (profileUserId) {
      const memoryCtx = await buildMemoryContext({
        userId: profileUserId,
        characterId,
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
    }

    const finalizeSuccess = async (reply: string) => {
      let historyId: string | undefined;
      if (profileUserId) {
        if (!(await beginWorkerJobSave(request))) {
          if (billingCharge) {
            try {
              runeBalance = await BillingService.rollbackCharge({
                userId: profileUserId,
                cost: billingCharge.spentRunes,
                wasFreeQuestion: billingCharge.wasFreeQuestion,
                actionType: "VISION_ANALYSIS",
              });
            } catch (refundErr) {
              console.error("Photo save-race refund failed:", refundErr);
            }
          }
          await trackWorkerJobFailed(request, "Photo reading save race", {
            refunded: Boolean(billingCharge),
            errorCode: "generation_failed",
          });
          return NextResponse.json(
            {
              error: "Не удалось сохранить трактовку. Руны возвращены. Попробуйте ещё раз.",
              code: "generation_failed",
              refunded: Boolean(billingCharge),
            },
            { status: 502 }
          );
        }
        historyId = await persistPhotoReadingResult({
          profileUserId,
          characterId,
          analysisBody: reply,
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

      const payload = {
        analysis: reply,
        detectedCards,
        deckType: confirmedSpread!.deckType,
        spreadType: confirmedSpread!.spreadType,
        deckSystem: confirmedSpread!.system,
        redrawSpread: confirmedSpread,
        tarotCards,
        characterId,
        isPaid: isPaid || spentRunes > 0,
        saved: Boolean(profileUserId),
        historyId,
        sessionId: resolvedSessionId,
        runeBalance,
        firstPhotoDiscount,
        streamed: false,
      };
      await trackWorkerJobCompleted(request, payload);
      return NextResponse.json(payload);
    };

    const refundAndFail = async (message: string) => {
      if (profileUserId && billingCharge) {
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
          console.error("Photo reading refund failed:", refundErr);
        }
      }
      await trackWorkerJobFailed(request, message, {
        refunded: true,
        errorCode: "generation_failed",
      });
      return NextResponse.json(
        {
          error: "Не удалось получить трактовку. Руны возвращены. Попробуйте ещё раз.",
          code: "generation_failed",
          refunded: true,
          runeBalance,
        },
        { status: 502 }
      );
    };

    if (preferJson) {
      const generated = await createPhotoInterpretationJson({
        systemPrompt,
        spreadSummary,
        question: question.trim() || undefined,
        userName: ctx.userName ?? "друг",
        cardCount: confirmedSpread!.cards.length,
      });
      if (generated.llmFailed || !generated.reply.trim()) {
        return refundAndFail("Photo reading generation failed");
      }
      return finalizeSuccess(generated.reply);
    }

    const sse = await createPhotoInterpretationStream({
      systemPrompt,
      spreadSummary,
      question: question.trim() || undefined,
      userName: ctx.userName ?? "друг",
      cardCount: confirmedSpread!.cards.length,
      onComplete: async ({ reply, llmFailed }) => {
        if (llmFailed && profileUserId && billingCharge) {
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
            console.error("Photo stream refund failed:", refundErr);
          }
        }

        let historyId: string | undefined;
        if (profileUserId && !llmFailed) {
          historyId = await persistPhotoReadingResult({
            profileUserId,
            characterId,
            analysisBody: reply,
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

        return {
          analysis: reply,
          detectedCards,
          deckType: confirmedSpread!.deckType,
          spreadType: confirmedSpread!.spreadType,
          deckSystem: confirmedSpread!.system,
          redrawSpread: confirmedSpread,
          tarotCards,
          characterId,
          isPaid: isPaid || spentRunes > 0,
          saved: Boolean(profileUserId) && !llmFailed,
          historyId,
          sessionId: resolvedSessionId,
          runeBalance,
          firstPhotoDiscount,
          streamed: true,
          refunded: llmFailed && spentRunes === 0,
        };
      },
    });

    if (!sse) {
      return refundAndFail("Photo reading stream failed to start");
    }

    return sse;
  });
}
