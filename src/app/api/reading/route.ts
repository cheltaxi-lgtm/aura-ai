import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { hasPaidAccess, unlockSingleSession, getSessionMessagesForLlm } from "@/lib/session";
import { buildCharacterPrompt, buildHumanReadingPrompt, generateReading } from "@/lib/chat-prompts";
import { isAiMasterId } from "@/lib/showcase-masters";
import { getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import {
  profileAuthFailureResponse,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  getAsyncJobIdFromRequest,
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  beginWorkerJobSave,
  chargeRuneActionForWorkerJob,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
  trackWorkerJobRefunded,
} from "@/lib/async-job-lifecycle";
import { mergeAsyncJobPeriodMetadata } from "@/lib/async-jobs";
import {
  buildAiProvenance,
  fingerprintAiInput,
  isAiCacheReusable,
} from "@/lib/ai-generation-contract";
import { getSetting } from "@/lib/settings";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { buildNatalPromptContext } from "@/lib/prompts/natal-context";
import { generateNumerologSessionReading } from "@/lib/services/numerology-service";
import { resolveSessionForUser } from "@/lib/session-access";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { resolveIsDailyFreeReading } from "@/lib/daily-spread-billing";
import { resolveGuestResumeFreeReading } from "@/lib/guest-resume-billing";
import { setGuestResumeReadingId } from "@/lib/guest-triplet-receipt-db";
import { buildTeaserContinuityPromptBlock } from "@/lib/guest-triplet-teaser-service";
import {
  findSpreadReadingEntry,
  withSpreadReadingLock,
} from "@/lib/reading-idempotency";
import { createHistoryEntry, patchTripletInterpretation, getUserById } from "@/lib/users";
import { tarotCardsKey } from "@/lib/tarot";
import { buildMemoryContext, appendMemoryContextToPrompt } from "@/lib/memory/build-memory-context";
import {
  buildSpreadUserMessage,
  enrichCardsForSpreadContext,
  resolveIntentionLabel,
  userContextFromProfile,
} from "@/lib/prompts/user-context";
import { getSessionMemories, countSessionMemories } from "@/lib/session-memory";
import { isValidSessionIntention } from "@/lib/session-topics";
import {
  formatUserQuestionForPrompt,
  resolveApiCharacterId,
  sanitizeTextField,
  stripMemoryLeakFromReply,
  sanitizeReadingForClient,
} from "@/lib/chat-sanitize";
import { isPaidSpreadTextComplete } from "@/lib/spread-reading-complete";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { INTENTION_OPTIONS, intentionPromptBlock, intentionReadingPromptBlock } from "@/lib/intention";
import {
  buildNumerologSpreadReading,
  isNumerologMaster,
} from "@/lib/numerolog/welcome";
import {
  DEFAULT_NUMEROLOG_SESSION_TOOL,
  encodeNumerologSpreadId,
  getNumerologTool,
  isNumerologSessionToolId,
  numerologReadingCacheKey,
  validateNumerologToolParams,
  type NumerologToolParams,
} from "@/lib/numerology/tools";
import {
  destinyMatrix,
  MATRIX_CALCULATION_VERSION,
  matrixToStructuredData,
} from "@/lib/numerology/destiny-matrix";
import {
  deleteOwnedMatrixReportsForSubject,
  deleteOwnedMatrixReportsForBirth,
  findUsableOwnedMatrixReportBySubject,
  findUsableOwnedMatrixReport,
  lookupOwnedMatrixReportBySubject,
  lookupOwnedMatrixReport,
  MATRIX_REPORT_TOOL_ID,
  saveMatrixReport,
  toIsoBirthDate as toIsoBirthDateShared,
} from "@/lib/services/numerology-report-service";
import {
  ensureSelfSubject,
  getMatrixSubject,
  type MatrixSubject,
} from "@/lib/services/matrix-subject-service";
import type { RuneActionType } from "@/lib/rune-costs";
import { purgeMatrixConsultationSessions } from "@/lib/numerology/matrix-session-cleanup";
import { ensureSpreadReadingInChatMessages } from "@/lib/spread-reading-persist";
import {
  periodSpreadPositions,
  periodSpreadTaskLabel,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";
import { normalizeSpreadId, resolveSpreadPositions } from "@/lib/spreads";
import type { SessionTopicId } from "@/lib/session-topics";
async function persistReadingToSession(input: {
  sessionId: string | undefined;
  profileUserId: string;
  characterId: string;
  reading: string;
  tarotCards: { name: string }[];
  intention?: string;
  spreadType?: "daily" | "new" | "guest_resume";
  spreadId?: string;
  customQuestion?: string;
}): Promise<string | null> {
  return ensureSpreadReadingInChatMessages({
    sessionId: input.sessionId,
    profileUserId: input.profileUserId,
    characterId: input.characterId,
    reading: input.reading,
    tarotCards: input.tarotCards,
    intention: input.intention,
    spreadType: input.spreadType === "guest_resume" ? null : input.spreadType,
    spreadId: input.spreadId,
    customQuestion: input.customQuestion,
  });
}

async function respondWithExistingSpreadReading(input: {
  existing: Awaited<ReturnType<typeof findSpreadReadingEntry>> & {};
  profileUserId: string;
  characterId: string;
  cardsKey: string;
  tarotCards: { name: string; meaning: string }[];
  sessionId?: string;
  intention?: string;
  spreadType?: "daily" | "new" | "guest_resume";
  spreadId?: string;
  customQuestion?: string;
  userName: string;
  birthDate: string;
  isPaid: boolean;
}) {
  const { existing } = input;
  if (!existing) throw new Error("missing_existing_reading");

  const storedReading = existing.context_data.reading as string | undefined;
  const reading =
    storedReading?.trim() ||
    (isNumerologMaster(input.characterId)
      ? buildNumerologSpreadReading({
          userName: input.userName,
          birthDate: input.birthDate,
          fullName: input.userName,
          spreadNumbers: input.tarotCards.map((c) => c.name),
        })
      : "");
  const historyId = existing.id;
  const paid = existing.is_paid || input.isPaid;

  // Cache hit must still consume guest entitlement — otherwise the client opens
  // chat, fails the reading_consumed post-check, and kicks back to the homepage.
  if (
    input.spreadType === "guest_resume" &&
    input.sessionId &&
    historyId &&
    (await ensureDb())
  ) {
    try {
      await setGuestResumeReadingId(input.sessionId, input.profileUserId, historyId);
    } catch (err) {
      console.warn("Guest resume consume on cache hit failed:", err);
    }
  }

  void patchTripletInterpretation(input.profileUserId, input.cardsKey, {
    text: reading,
    masterId: input.characterId,
  }).catch((err) => console.warn("Triplet interpretation patch failed:", err));

  try {
    await persistReadingToSession({
      sessionId: input.sessionId,
      profileUserId: input.profileUserId,
      characterId: input.characterId,
      reading,
      tarotCards: input.tarotCards,
      intention: input.intention,
      spreadType: input.spreadType,
      spreadId: input.spreadId,
      customQuestion: input.customQuestion,
    });
  } catch (err) {
    console.warn("Reading chat save failed:", err);
  }

  return NextResponse.json({
    reading,
    isPaid: paid,
    historyId,
    reused: true,
    createdAt:
      existing.created_at instanceof Date
        ? existing.created_at.toISOString()
        : String(existing.created_at),
  });
}

/** Matrix zone assembly (numerology_reading worker) can run ~7 min. */
export const maxDuration = 420;

function matrixRuneAction(
  toolId: string,
  subjectKind: MatrixSubject["kind"] | undefined
): RuneActionType {
  if (toolId === "child_matrix") return "CHILD_MATRIX_REPORT";
  if (toolId === "matrix_year_forecast") return "MATRIX_YEAR_FORECAST";
  if (toolId === "matrix_compatibility") return "MATRIX_PAIR_REPORT";
  if (subjectKind && subjectKind !== "self") return "MATRIX_SUBJECT_REPORT";
  return "NUMEROLOGY_SESSION";
}

export async function POST(request: NextRequest) {
  let characterId = "ragnar";
  let userName = "друг";
  let gender = "";
  let zodiac = "";
  let birthDate = "";
  let tarotCards: {
    id?: number;
    name: string;
    meaning: string;
    reversed?: boolean;
  }[] = [];
  let sessionId: string | undefined;
  let birthTime: string | undefined;
  let birthCity: string | undefined;
  let lifeFocus: string | undefined;
  let mainQuestion: string | undefined;
  let astroMeta: import("@/lib/astro-profile").AstroMeta | undefined;
  let isPaid = false;
  let intention = "";
  let customQuestion = "";
  let forceRegenerate = false;
  let spreadType = "";
  let readingScope = "";
  let spreadIdRaw = "";
  let numerologToolIdRaw = "";
  let numerologToolParams: NumerologToolParams = {};
  let matrixSubjectId: string | undefined;
  let asyncRequested = false;
  let rawBody: Record<string, unknown> = {};

  try {
    const body = await request.json();
    rawBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    asyncRequested = body.async === true;
    characterId = await resolveApiCharacterId(body.characterId);
    userName = sanitizeTextField(body.userName, 80) ?? userName;
    gender = sanitizeTextField(body.gender, 20) ?? gender;
    zodiac = sanitizeTextField(body.zodiac, 40) ?? zodiac;
    birthDate = sanitizeTextField(body.birthDate, 20) ?? birthDate;
    tarotCards = body.tarotCards ?? tarotCards;
    sessionId = body.sessionId;
    birthTime = sanitizeTextField(body.birthTime, 10);
    birthCity = sanitizeTextField(body.birthCity, 100);
    lifeFocus = sanitizeTextField(body.lifeFocus, 40);
    mainQuestion = sanitizeTextField(body.mainQuestion, 500);
    astroMeta = body.astroMeta;
    intention = sanitizeTextField(body.intention, 40) ?? "";
    customQuestion = sanitizeTextField(body.customQuestion, 500) ?? "";
    spreadType = sanitizeTextField(body.spreadType, 20) ?? "";
    spreadIdRaw = sanitizeTextField(body.spreadId, 40) ?? "";
    forceRegenerate = body.forceRegenerate === true;
    readingScope = sanitizeTextField(body.readingScope, 10) ?? "";
    numerologToolIdRaw = sanitizeTextField(body.numerologToolId, 40) ?? "";
    const sanitizedSubjectId = sanitizeTextField(body.matrixSubjectId, 40);
    matrixSubjectId =
      sanitizedSubjectId && /^[0-9a-f-]{1,40}$/i.test(sanitizedSubjectId)
        ? sanitizedSubjectId
        : undefined;
    if (body.numerologToolParams && typeof body.numerologToolParams === "object") {
      const raw = body.numerologToolParams as Record<string, unknown>;
      numerologToolParams = {
        partnerName: sanitizeTextField(raw.partnerName, 80) ?? undefined,
        partnerDate: sanitizeTextField(raw.partnerDate, 20) ?? undefined,
        objectValue: sanitizeTextField(raw.objectValue, 120) ?? undefined,
      };
    }
  } catch (error) {
    console.error("Reading JSON error:", error);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const requestNumerologToolId = isNumerologSessionToolId(numerologToolIdRaw)
    ? numerologToolIdRaw
    : null;
  const requestAllowsEmptyCards =
    isNumerologMaster(characterId) &&
    requestNumerologToolId !== null &&
    getNumerologTool(requestNumerologToolId).drawCount === 0;

  if (!characterId || !userName || (!tarotCards?.length && !requestAllowsEmptyCards)) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (intention && !isValidSessionIntention(intention)) {
    intention = "";
  }

  const workerUserId = getAsyncJobWorkerUserId(request);
  let authed: { auth: { sub: string }; profileUserId: string };
  if (workerUserId) {
    authed = { auth: { sub: workerUserId }, profileUserId: workerUserId };
  } else {
    const profileCtx = await resolveProfileUserContext();
    if (!profileCtx.ok) {
      return profileAuthFailureResponse(profileCtx.reason);
    }
    authed = {
      auth: profileCtx.auth,
      profileUserId: profileCtx.profileUserId,
    };
  }

  if (intention === "life_death") {
    return NextResponse.json({ reading: "", skipReading: true });
  }

  const serverProfile = await getUserById(authed.profileUserId);
  if (serverProfile) {
    userName = normalizePersonDisplayNameOr(serverProfile.name, "друг");
    gender = serverProfile.gender;
    zodiac = serverProfile.zodiac;
    // Normalize DATE::text / dotted client formats to a stable birth-date string.
    const { toIsoBirthDate } = await import("@/lib/services/numerology-report-service");
    birthDate =
      toIsoBirthDate(serverProfile.birth_date) ??
      toIsoBirthDate(String(serverProfile.birth_date).slice(0, 10)) ??
      String(serverProfile.birth_date ?? "").slice(0, 10);
    birthTime = serverProfile.birth_time ?? undefined;
    birthCity = serverProfile.birth_city ?? undefined;
    lifeFocus = serverProfile.life_focus ?? undefined;
    mainQuestion = serverProfile.main_question ?? undefined;
    astroMeta = serverProfile.astro_meta as import("@/lib/astro-profile").AstroMeta;
  }

  const isMatrixSubjectTool =
    isNumerologMaster(characterId) &&
    (requestNumerologToolId === MATRIX_REPORT_TOOL_ID ||
      requestNumerologToolId === "matrix_compatibility" ||
      requestNumerologToolId === "child_matrix" ||
      requestNumerologToolId === "matrix_year_forecast");
  const isMatrixBuyOnceTool =
    isMatrixSubjectTool &&
    (requestNumerologToolId === MATRIX_REPORT_TOOL_ID ||
      requestNumerologToolId === "child_matrix" ||
      requestNumerologToolId === "matrix_year_forecast");
  let resolvedMatrixSubject: MatrixSubject | null = null;
  if (isMatrixSubjectTool) {
    if (matrixSubjectId) {
      resolvedMatrixSubject = await getMatrixSubject(
        authed.profileUserId,
        matrixSubjectId
      );
      if (!resolvedMatrixSubject) {
        return NextResponse.json(
          { error: "Субъект матрицы не найден.", code: "matrix_subject_forbidden" },
          { status: 403 }
        );
      }
    } else if (isMatrixBuyOnceTool) {
      // Never silently fall back to «Я» — that reopened the user's own matrix
      // when the client lost matrixSubjectId for another person.
      return NextResponse.json(
        {
          error: "Выберите, чью матрицу открыть.",
          code: "matrix_subject_required",
        },
        { status: 400 }
      );
    }

    if (resolvedMatrixSubject) {
      birthDate = resolvedMatrixSubject.birthDate;
      birthTime = resolvedMatrixSubject.birthTime ?? undefined;
      birthCity = resolvedMatrixSubject.birthCity ?? undefined;
      if (resolvedMatrixSubject.displayName?.trim()) {
        userName = resolvedMatrixSubject.displayName.trim();
      }
    }
  }

  if (!workerUserId) {
    const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "reading");
    if (rateLimited) return rateLimited;
  }

  // Buy-once Full Matrix reopen MUST stay sync and run before async enqueue.
  // Otherwise every reopen sits in numerology_reading for minutes while the grid
  // already shows — users report this as "матрица зависает".
  if (
    !forceRegenerate &&
    !workerUserId &&
    isNumerologMaster(characterId) &&
    isMatrixBuyOnceTool &&
    (await ensureDb())
  ) {
    const isoBirth =
      toIsoBirthDateShared(birthDate) ??
      toIsoBirthDateShared(String(birthDate).slice(0, 10));
    const owned = resolvedMatrixSubject
      ? await findUsableOwnedMatrixReportBySubject(
          authed.profileUserId,
          resolvedMatrixSubject.id,
          { toolId: requestNumerologToolId ?? undefined }
        )
      : await findUsableOwnedMatrixReport(authed.profileUserId, isoBirth ?? birthDate, {
          toolId: requestNumerologToolId ?? undefined,
        });
    if (owned?.content?.trim()) {
      const reading = owned.content.trim();
      let historyId: string | undefined;
      if (sessionId) {
        try {
          await persistReadingToSession({
            sessionId,
            profileUserId: authed.profileUserId,
            characterId,
            customQuestion: customQuestion || undefined,
            reading,
            tarotCards,
            intention: intention || undefined,
            spreadType: spreadType === "daily" ? "daily" : "new",
            spreadId: encodeNumerologSpreadId(requestNumerologToolId),
          });
        } catch (err) {
          console.warn("Owned matrix reading chat save failed:", err);
        }
      }
      try {
        const entry = await createHistoryEntry({
          userId: authed.profileUserId,
          characterName: characterId,
          contextData: {
            type: "reading",
            reading,
            tarotCards,
            deckSystem: resolveMasterDeckSystem(characterId),
            userName,
            birthDate: isoBirth ?? birthDate,
            numerologToolId: requestNumerologToolId,
            matrixOwned: true,
            reportId: owned.id,
            ...(resolvedMatrixSubject
              ? {
                  matrixSubjectId: resolvedMatrixSubject.id,
                  subjectKind: resolvedMatrixSubject.kind,
                  subjectName: resolvedMatrixSubject.displayName,
                }
              : {}),
            ...(sessionId ? { sessionId } : {}),
          },
          isPaid: true,
        });
        historyId = entry.id;
      } catch (err) {
        console.warn("Owned matrix history entry failed:", err);
      }
      return NextResponse.json({
        reading,
        isPaid: true,
        historyId,
        reportId: owned.id,
        reused: true,
        matrixOwned: true,
        createdAt: owned.createdAt || new Date().toISOString(),
        ...(resolvedMatrixSubject
          ? {
              matrixSubjectId: resolvedMatrixSubject.id,
              subjectKind: resolvedMatrixSubject.kind,
              subjectName: resolvedMatrixSubject.displayName,
            }
          : {}),
      });
    }
  }

  if (asyncRequested && isAsyncJobWorkerConfigured()) {
    const longNumerology =
      isNumerologMaster(characterId) &&
      (requestNumerologToolId === "destiny_matrix" ||
        requestNumerologToolId === "matrix_compatibility" ||
        requestNumerologToolId === "child_matrix" ||
        requestNumerologToolId === "matrix_year_forecast");
    const isoBirthForJob =
      toIsoBirthDateShared(birthDate) ??
      toIsoBirthDateShared(String(birthDate ?? "").slice(0, 10));
    return enqueuePaidAsyncJob({
      userId: authed.profileUserId,
      kind: longNumerology ? "numerology_reading" : "reading",
      payload: {
        ...rawBody,
        async: false,
        ...(isoBirthForJob ? { birthDate: isoBirthForJob } : {}),
        ...(resolvedMatrixSubject ? { matrixSubjectId: resolvedMatrixSubject.id } : {}),
      },
      bypassDeliveryGate: true,
    });
  }

  let spentRunes = 0;
  let billingCharge: BillingChargeResult | null = null;
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionForUser>>["session"] = null;
  let isGuestResumeFree = false;

  try {
    const unlimited = await resolveUnlimitedAccess({
      accountId: authed.auth.sub,
      profileUserId: authed.profileUserId,
    });

    if (await ensureDb()) {
      if (sessionId) {
        const resolved = await resolveSessionForUser(sessionId, authed.profileUserId);
        if (resolved.error) return resolved.error;
        resolvedSession = resolved.session!;
        isPaid = hasPaidAccess(resolvedSession, { unlimited });
        if (!spreadType && resolvedSession.spread_type === "daily") {
          spreadType = "daily";
        }
      } else if (unlimited) {
        isPaid = true;
      }
    } else if (unlimited) {
      isPaid = true;
    }

    const guestResume = await resolveGuestResumeFreeReading({
      profileUserId: authed.profileUserId,
      sessionId,
      session: resolvedSession,
      characterId,
      tarotCards,
    });
    isGuestResumeFree = Boolean(guestResume?.free);
    if (guestResume?.question && !customQuestion) {
      customQuestion = guestResume.question;
    }
    // Harden before any prompt / history embedding (length, quote breakout, tag strip).
    customQuestion = customQuestion
      ? formatUserQuestionForPrompt(customQuestion)
      : "";
    if (guestResume) {
      tarotCards = [...guestResume.symbols]
        .sort((a, b) => a.position - b.position)
        .map((symbol) => ({
          id: symbol.id,
          name: symbol.reversed
            ? `${symbol.name} (перевёрнутая)`
            : symbol.name,
          meaning: "",
          reversed: symbol.reversed,
        }));
    }
    // Free-form guest/custom question uses the existing "custom" intention slot —
    // do not invent a catalog topic when the user left the question empty.
    const readingIntention =
      intention || (customQuestion ? "custom" : "");

    const today = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const ctx = {
      userName,
      gender,
      zodiac,
      birthDate,
      today,
      tarotCards,
      isPaid,
      birthTime,
      birthCity,
      lifeFocus,
      mainQuestion,
      astroMeta,
    };

    const sessionMemories = await getSessionMemories(authed.profileUserId, characterId, 3);
    const sessionNumber = sessionMemories.length
      ? sessionMemories.length + 1
      : (await countSessionMemories(authed.profileUserId, characterId)) + 1;

    const spreadId = normalizeSpreadId(spreadIdRaw || resolvedSession?.spread_id);
    const storedSpreadId = requestNumerologToolId
      ? encodeNumerologSpreadId(requestNumerologToolId)
      : spreadId;
    const positionLabels = resolveSpreadPositions(
      spreadId,
      (intention || null) as SessionTopicId | null
    ).map((p) => p.label);

    const natalChartBlock = await buildNatalPromptContext({
      profileUserId: authed.profileUserId,
      characterId,
      topic: customQuestion || mainQuestion || intention,
      purpose: "tarot",
    });

    let systemPrompt = buildCharacterPrompt(characterId, ctx, {
      sessionNumber,
      // Past-session memory is rendered once, below, via buildMemoryContext()
      // (relevance-gated against the actual question). Passing `sessionMemories`
      // here too used to render the *same* rows a second time through the
      // legacy formatLegacySessionMemories() path — doubling prompt tokens.
      memory: [],
      intention: readingIntention || null,
      spreadId,
      lastUserMessage: customQuestion || undefined,
      customQuestion: customQuestion || null,
      natalChartBlock,
    });

    if (!isAiMasterId(characterId) && (await ensureDb())) {
      const blogger = await getBloggerBySlug(characterId);
      if (blogger) {
        const knowledge = await getBloggerKnowledge(blogger.id);
        systemPrompt = buildHumanReadingPrompt(blogger, ctx, knowledge, readingIntention || null, {
          spreadId,
          positionLabels,
        });
      }
    }

    if (readingIntention) {
      systemPrompt += intentionReadingPromptBlock(readingIntention, {
        spreadId,
        cardCount: tarotCards.length,
        positionLabels,
        customQuestion: customQuestion || null,
      });
    }

    if (guestResume?.teaserText) {
      systemPrompt += buildTeaserContinuityPromptBlock(guestResume.teaserText);
    }

    const cardsKey = guestResume?.fingerprint ??
      (isNumerologMaster(characterId) && requestNumerologToolId
        ? numerologReadingCacheKey({
            characterId,
            toolId: requestNumerologToolId,
            birthDate,
            cardNames: tarotCards.map((c) => c.name),
            params: numerologToolParams,
            matrixSubjectId: resolvedMatrixSubject?.id,
          })
        : tarotCardsKey(tarotCards));
    // Full Matrix buy-once lives in numerology_report_history only.
    // History cache reused the old watery report even after report rows were deleted.
    const skipHistoryCacheForMatrix =
      isNumerologMaster(characterId) && isMatrixBuyOnceTool;

    // Durable reading reference — return before name-keyed cache / generation.
    if (guestResume?.readingId && !forceRegenerate && (await ensureDb())) {
      const { rows: historyRows } = await query<{
        id: string;
        context_data: Record<string, unknown>;
        is_paid: boolean;
        created_at: Date;
      }>(
        `SELECT id, context_data, is_paid, created_at
         FROM history
         WHERE id = $1 AND user_id = $2
         LIMIT 1`,
        [guestResume.readingId, authed.profileUserId]
      );
      const existingRow = historyRows[0];
      if (
        existingRow &&
        typeof existingRow.context_data?.reading === "string" &&
        isAiCacheReusable(existingRow.context_data)
      ) {
        return respondWithExistingSpreadReading({
          existing: existingRow,
          profileUserId: authed.profileUserId,
          characterId,
          cardsKey: guestResume.fingerprint,
          tarotCards,
          sessionId,
          intention: intention || undefined,
          spreadType: "guest_resume",
          spreadId: storedSpreadId,
          customQuestion: customQuestion || guestResume.question || undefined,
          userName,
          birthDate,
          isPaid: true,
        });
      }
    }

    const isDailySpread =
      !isGuestResumeFree &&
      (await resolveIsDailyFreeReading({
        profileUserId: authed.profileUserId,
        spreadType,
        intention,
        sessionId,
        tarotCards,
        session: resolvedSession,
      }));
    if (isDailySpread) {
      spreadType = "daily";
      isPaid = true;
    }
    if (isGuestResumeFree) {
      isPaid = true;
      spreadType = "guest_resume";
    }
    let historyId: string | undefined;
    let reading: string;

    const lockKey = isGuestResumeFree && guestResume
      ? `guest-resume:${guestResume.fingerprint}`
      : cardsKey;

    if (await ensureDb() && cardsKey && !forceRegenerate && !skipHistoryCacheForMatrix) {
      const existing = await findSpreadReadingEntry(
        authed.profileUserId,
        characterId,
        cardsKey
      );
      if (existing && isAiCacheReusable(existing.context_data)) {
        return respondWithExistingSpreadReading({
          existing,
          profileUserId: authed.profileUserId,
          characterId,
          cardsKey,
          tarotCards,
          sessionId,
          intention: intention || undefined,
          spreadType: isGuestResumeFree
            ? "guest_resume"
            : isDailySpread
              ? "daily"
              : undefined,
          spreadId: storedSpreadId,
          customQuestion: customQuestion || guestResume?.question || undefined,
          userName,
          birthDate,
          isPaid: isGuestResumeFree ? true : isPaid,
        });
      }
    }

    const runLockedGeneration = async () => {
      if (await ensureDb() && cardsKey && !forceRegenerate && !skipHistoryCacheForMatrix) {
        const existing = await findSpreadReadingEntry(
          authed.profileUserId,
          characterId,
          cardsKey
        );
        if (existing && isAiCacheReusable(existing.context_data)) {
          return { kind: "existing" as const, existing };
        }
      }

      if (isNumerologMaster(characterId)) {
        const toolId = isNumerologSessionToolId(numerologToolIdRaw)
          ? numerologToolIdRaw
          : DEFAULT_NUMEROLOG_SESSION_TOOL;
        const tool = getNumerologTool(toolId);
        const paramError = validateNumerologToolParams(toolId, numerologToolParams);
        if (paramError) {
          return { kind: "failed" as const };
        }
        const spreadNumbers = tarotCards.map((c) => c.name).slice(0, tool.drawCount);
        if (spreadNumbers.length < tool.drawCount) {
          return { kind: "failed" as const };
        }

        const isMatrixBuyOnceTool =
          toolId === MATRIX_REPORT_TOOL_ID ||
          toolId === "child_matrix" ||
          toolId === "matrix_year_forecast";
        let runeBalance: number | undefined;
        let numerologyUi:
          | { pythagorasSquare?: import("@/lib/numerology/pythagoras-square").PythagorasSquareResult }
          | undefined;
        let matrixDocumentForSave:
          | import("@/lib/numerology/matrix-reading-document").MatrixReadingDocument
          | undefined;

        // Buy-once Full Matrix: reopen usable saved AI report for THIS birth date only.
        // forceRegenerate / unusable (leaked) content must not short-circuit.
        let matrixRegenerateAfterLeak = false;
        if (isMatrixBuyOnceTool && !forceRegenerate && (await ensureDb())) {
          const isoBirth =
            toIsoBirthDateShared(birthDate) ??
            toIsoBirthDateShared(String(birthDate).slice(0, 10));
          const lookup = resolvedMatrixSubject
            ? await lookupOwnedMatrixReportBySubject(
                authed.profileUserId,
                resolvedMatrixSubject.id,
                { toolId }
              )
            : await lookupOwnedMatrixReport(authed.profileUserId, isoBirth ?? birthDate, {
                toolId,
              });
          if (lookup.usable && lookup.report?.content?.trim()) {
            const owned = lookup.report;
            reading = owned.content;
            isPaid = true;
            let reopenHistoryId: string | undefined;
            try {
              await persistReadingToSession({
                sessionId,
                profileUserId: authed.profileUserId,
                characterId,
                customQuestion: customQuestion || undefined,
                reading,
                tarotCards,
                intention: intention || undefined,
                spreadType: isDailySpread ? "daily" : "new",
                spreadId: storedSpreadId,
              });
            } catch (err) {
              console.warn("Reading chat save failed:", err);
            }
            try {
              const entry = await createHistoryEntry({
                userId: authed.profileUserId,
                characterName: characterId,
                contextData: {
                  type: "reading",
                  reading,
                  tarotCards,
                  deckSystem: resolveMasterDeckSystem(characterId),
                  userName,
                  birthDate: isoBirth ?? birthDate,
                  numerologToolId: toolId,
                  matrixOwned: true,
                  reportId: owned.id,
                  ...(resolvedMatrixSubject
                    ? {
                        matrixSubjectId: resolvedMatrixSubject.id,
                        subjectKind: resolvedMatrixSubject.kind,
                        subjectName: resolvedMatrixSubject.displayName,
                      }
                    : {}),
                  ...(sessionId ? { sessionId } : {}),
                },
                isPaid: true,
              });
              reopenHistoryId = entry.id;
            } catch (err) {
              console.warn("Owned matrix history entry failed:", err);
            }
            return {
              kind: "new" as const,
              reading,
              historyId: reopenHistoryId,
              reportId: owned.id,
              isPaid: true,
              runeBalance: undefined,
              numerologyUi,
              reused: true,
              matrixOwned: true,
              ...(resolvedMatrixSubject
                ? {
                    matrixSubjectId: resolvedMatrixSubject.id,
                    subjectKind: resolvedMatrixSubject.kind,
                    subjectName: resolvedMatrixSubject.displayName,
                  }
                : {}),
            };
          }
          // Bad/leaked owned report: wipe once, then regenerate free (bot parity).
          // Always subject-scoped — birth-date wipe used to erase other people too.
          if (lookup.unusable && lookup.report) {
            matrixRegenerateAfterLeak = true;
            const subjectForWipe =
              resolvedMatrixSubject ??
              (await ensureSelfSubject(authed.profileUserId).catch(() => null));
            const wiped = subjectForWipe
              ? await deleteOwnedMatrixReportsForSubject(
                  authed.profileUserId,
                  subjectForWipe.id,
                  { toolId }
                )
              : await deleteOwnedMatrixReportsForBirth(
                  authed.profileUserId,
                  isoBirth ?? birthDate,
                  { toolId }
                );
            await purgeMatrixConsultationSessions(
              authed.profileUserId,
              wiped.sessionIds
            );
          }
        }

        const runeSettings = await getRuneSettings();
        const useRuneBilling =
          !isDailySpread &&
          !matrixRegenerateAfterLeak &&
          isRuneBillingActive(authed.profileUserId, unlimited, runeSettings);

        if (useRuneBilling) {
          try {
            // Worker-aware charge: links ledger to async_jobs and reuses on requeue.
            const charge = await chargeRuneActionForWorkerJob({
              request,
              userId: authed.profileUserId,
              action: isMatrixSubjectTool
                ? matrixRuneAction(toolId, resolvedMatrixSubject?.kind)
                : "NUMEROLOGY_SESSION",
            });
            billingCharge = charge;
            runeBalance = charge.newBalance;
            spentRunes = charge.spentRunes;
          } catch (err) {
            if (err instanceof InsufficientFundsError) {
              return {
                kind: "insufficient" as const,
                balance: err.balance,
                cost: err.required,
              };
            }
            throw err;
          }
          isPaid = true;
          // Matrix: 3 included chat questions via freeLimit, not unlimited unlock.
          if (sessionId && !isMatrixBuyOnceTool) {
            await unlockSingleSession(sessionId);
          }
        }

        try {
          const numerologMemoryCtx = await buildMemoryContext({
            userId: authed.profileUserId,
            characterId: "numerolog",
            sessionId: sessionId ?? undefined,
            profile: {
              name: userName,
              birthDate,
              mainQuestion: customQuestion || undefined,
            },
            lastUserMessage: customQuestion || tool.label,
            mainQuestion: customQuestion || undefined,
          });
          const numerologMemoryBlock =
            `${numerologMemoryCtx.clientBlock}${numerologMemoryCtx.pastSessionsBlock}${numerologMemoryCtx.factsBlock}`.trim() ||
            undefined;
          const workerJobId = getAsyncJobIdFromRequest(request);
          const sessionResult = await generateNumerologSessionReading({
            toolId,
            toolParams: numerologToolParams,
            userName,
            birthDate,
            fullName: userName,
            gender,
            spreadNumbers,
            memoryBlock: numerologMemoryBlock,
            birthTime,
            birthCity,
            userId: authed.profileUserId,
            onMatrixProgress:
              workerJobId && toolId === "destiny_matrix"
                ? async (progress) => {
                    await mergeAsyncJobPeriodMetadata(workerJobId, { progress });
                  }
                : undefined,
          });
          reading = sessionResult.reply;
          numerologyUi = sessionResult.numerologyUi;
          matrixDocumentForSave = sessionResult.matrixDocument;
          if (isMatrixBuyOnceTool && matrixDocumentForSave) {
            const { MATRIX_AI_ZONES_CANARY_MIN } = await import(
              "@/lib/numerology/matrix-sectioned-reading"
            );
            const aiZones = matrixDocumentForSave.meta?.aiZones;
            if (typeof aiZones === "number" && aiZones < MATRIX_AI_ZONES_CANARY_MIN) {
              throw new Error(`matrix_ai_canary: aiZones=${aiZones}`);
            }
          }
        } catch (genErr) {
          console.error("Numerolog session reading failed:", genErr);
          if (billingCharge) {
            await BillingService.rollbackCharge({
              userId: authed.profileUserId,
              cost: billingCharge.spentRunes,
              wasFreeQuestion: false,
              actionType: billingCharge.actionType,
              transactionId: billingCharge.transactionId,
            });
            await trackWorkerJobRefunded(request);
            billingCharge = null;
            spentRunes = 0;
          }
          return { kind: "failed" as const };
        }

        if (isMatrixBuyOnceTool && (await ensureDb())) {
          try {
            if (!(await beginWorkerJobSave(request))) {
              if (billingCharge) {
                await BillingService.rollbackCharge({
                  userId: authed.profileUserId,
                  cost: billingCharge.spentRunes,
                  wasFreeQuestion: false,
                  actionType: billingCharge.actionType,
                  transactionId: billingCharge.transactionId,
                });
                await trackWorkerJobRefunded(request);
                billingCharge = null;
                spentRunes = 0;
              }
              return { kind: "failed" as const };
            }
            const matrix = birthDate ? destinyMatrix(birthDate) : null;
            const {
              isUsableMatrixReading,
              sanitizeReadingForClient,
            } = await import("@/lib/chat-reply-sanitize");
            const { matrixReadingToStructuredPayload } = await import(
              "@/lib/numerology/matrix-reading-document"
            );
            let matrixContent = sanitizeReadingForClient(reading) || reading;
            if (matrix && !isUsableMatrixReading(matrixContent)) {
              const { forceFillMissingSections } = await import(
                "@/lib/numerology/matrix-sectioned-reading"
              );
              const { resolveClientGender } = await import("@/lib/russian-name-gender");
              matrixContent = forceFillMissingSections(
                matrixContent,
                matrix,
                userName,
                resolveClientGender(gender, userName)
              );
              matrixContent = sanitizeReadingForClient(matrixContent) || matrixContent;
            }
            if (!isUsableMatrixReading(matrixContent)) {
              throw new Error("matrix_incomplete_after_fill");
            }
            reading = matrixContent;
            const structuredBase = matrix
              ? matrixToStructuredData(matrix)
              : { version: MATRIX_CALCULATION_VERSION };
            const saved = await saveMatrixReport({
              userId: authed.profileUserId,
              birthDateRaw: birthDate,
              subjectId: resolvedMatrixSubject?.id,
              toolId,
              content: reading,
              runeCost: billingCharge?.spentRunes ?? tool.cost,
              chargeTransactionId: billingCharge?.transactionId,
              sessionId,
              structuredData: {
                ...structuredBase,
                ...(matrixDocumentForSave
                  ? { reading: matrixReadingToStructuredPayload(matrixDocumentForSave) }
                  : {}),
              },
            });
            if (saved.status === "already_saved") {
              reading = saved.report.content;
              if (billingCharge) {
                await BillingService.rollbackCharge({
                  userId: authed.profileUserId,
                  cost: billingCharge.spentRunes,
                  wasFreeQuestion: false,
                  actionType: billingCharge.actionType,
                  transactionId: billingCharge.transactionId,
                });
                await trackWorkerJobRefunded(request);
                runeBalance = undefined;
                spentRunes = 0;
                billingCharge = null;
              }
              isPaid = true;
            }
          } catch (saveErr) {
            console.error("Matrix report save failed:", saveErr);
            if (billingCharge) {
              await BillingService.rollbackCharge({
                userId: authed.profileUserId,
                cost: billingCharge.spentRunes,
                wasFreeQuestion: false,
                actionType: billingCharge.actionType,
                transactionId: billingCharge.transactionId,
              });
              await trackWorkerJobRefunded(request);
              billingCharge = null;
              spentRunes = 0;
            }
            return { kind: "failed" as const };
          }
        }

        if (await ensureDb()) {
          const deckSystem = resolveMasterDeckSystem(characterId);
          const entry = await createHistoryEntry({
            userId: authed.profileUserId,
            characterName: characterId,
            contextData: {
              type: "reading",
              reading,
              tarotCards,
              deckSystem,
              userName,
              zodiac,
              gender,
              birthDate,
              numerologToolId: toolId,
              ...(resolvedMatrixSubject
                ? {
                    matrixSubjectId: resolvedMatrixSubject.id,
                    subjectKind: resolvedMatrixSubject.kind,
                    subjectName: resolvedMatrixSubject.displayName,
                  }
                : {}),
              ...(sessionId ? { sessionId } : {}),
              ...(numerologToolParams.partnerName ||
              numerologToolParams.partnerDate ||
              numerologToolParams.objectValue
                ? { numerologToolParams }
                : {}),
              ...(isDailySpread ? { spreadType: "daily" } : {}),
            },
            isPaid,
          });
          historyId = entry.id;

          if (!isNumerologMaster(characterId)) {
            void patchTripletInterpretation(authed.profileUserId, cardsKey, {
              text: reading,
              masterId: characterId,
            }).catch((err) => console.warn("Triplet interpretation patch failed:", err));
          }

          try {
            await persistReadingToSession({
              sessionId,
              profileUserId: authed.profileUserId,
              characterId,
              customQuestion: customQuestion || undefined,
              reading,
              tarotCards,
              intention: intention || undefined,
              spreadType: isDailySpread ? "daily" : "new",
              spreadId: storedSpreadId,
            });
          } catch (err) {
            console.warn("Reading chat save failed:", err);
          }
        }

        return {
          kind: "new" as const,
          reading,
          historyId,
          isPaid,
          runeBalance,
          numerologyUi,
        };
      }

      const runeSettings = await getRuneSettings();
      const useRuneBilling =
        !isDailySpread &&
        !isGuestResumeFree &&
        isRuneBillingActive(authed.profileUserId, unlimited, runeSettings);
      let runeBalance: number | undefined;

      if (useRuneBilling) {
        try {
          const charge = await BillingService.chargeRuneAction({
            userId: authed.profileUserId,
            action: "READING",
          });
          billingCharge = charge;
          runeBalance = charge.newBalance;
          spentRunes = charge.spentRunes;
        } catch (err) {
          if (err instanceof InsufficientFundsError) {
            return {
              kind: "insufficient" as const,
              balance: err.balance,
              cost: err.required,
            };
          }
          throw err;
        }
        isPaid = true;
        if (sessionId) {
          await unlockSingleSession(sessionId);
        }
      }

      let lastChatUserMessage = "";
      if (sessionId && (await ensureDb())) {
        const chatTail = await getSessionMessagesForLlm(sessionId, characterId, 3);
        lastChatUserMessage =
          [...chatTail].reverse().find((m) => m.role === "user")?.content?.trim() ?? "";
      }

      const memoryCtx = await buildMemoryContext({
        userId: authed.profileUserId,
        characterId,
        sessionId,
        profile: { name: userName, gender, zodiac, birthDate, mainQuestion, lifeFocus },
        lastUserMessage: lastChatUserMessage,
        intention,
        customQuestion,
        mainQuestion,
      });
      systemPrompt = appendMemoryContextToPrompt(systemPrompt, memoryCtx);

      const deckSystem = resolveMasterDeckSystem(characterId);
      const userForContext = userContextFromProfile({
        name: userName,
        gender,
        birthDate,
        zodiac,
        astroMeta: astroMeta as Record<string, unknown> | undefined,
      });
      const periodScope =
        readingScope === "today" || readingScope === "week" || readingScope === "month"
          ? (readingScope as PeriodSpreadScope)
          : null;
      const cardsForContext = enrichCardsForSpreadContext(
        deckSystem,
        tarotCards,
        periodScope ? periodSpreadPositions(periodScope) : undefined
      );
      const userMessage = buildSpreadUserMessage({
        user: userForContext,
        cards: cardsForContext,
        intention: customQuestion
          ? customQuestion
          : resolveIntentionLabel(readingIntention || intention || null),
        readingScopeLabel: periodScope ? periodSpreadTaskLabel(periodScope) : null,
      });

      const generated = await generateReading(systemPrompt, {
        userName,
        tarotCards,
        isPaid,
        characterId,
        intention: intention || null,
        spreadId,
        positionLabels,
        userMessage,
      });
      reading = sanitizeReadingForClient(
        stripMemoryLeakFromReply(generated.text) || generated.text,
        tarotCards.map((c) => c.name)
      );

      const readingOk =
        generated.fromLlm &&
        Boolean(reading?.trim()) &&
        isPaidSpreadTextComplete(reading, tarotCards.map((c) => c.name));

      if (!readingOk) {
        if (billingCharge) {
          runeBalance = await BillingService.rollbackCharge({
            userId: authed.profileUserId,
            cost: billingCharge.spentRunes,
            wasFreeQuestion: billingCharge.wasFreeQuestion,
            actionType: "READING",
            transactionId: billingCharge.transactionId,
          });
          billingCharge = null;
          spentRunes = 0;
        }
        return { kind: "failed" as const };
      }

      if (await ensureDb()) {
        if (!(await beginWorkerJobSave(request))) {
          if (billingCharge) {
            runeBalance = await BillingService.rollbackCharge({
              userId: authed.profileUserId,
              cost: billingCharge.spentRunes,
              wasFreeQuestion: billingCharge.wasFreeQuestion,
              actionType: "READING",
              transactionId: billingCharge.transactionId,
            });
            billingCharge = null;
            spentRunes = 0;
          }
          return { kind: "failed" as const };
        }
        const aiSettings = await getSetting("ai");
        const provenance =
          generated.provenance ??
          buildAiProvenance({
            model: String(aiSettings.paidModel || aiSettings.model || "unknown"),
            attempts: 1,
            finishReason: "stop",
            inputFingerprint: fingerprintAiInput([
              characterId,
              intention,
              spreadId,
              tarotCards.map((c) => c.name),
            ]),
            content: reading,
          });
        const entry = await createHistoryEntry({
          userId: authed.profileUserId,
          characterName: characterId,
          contextData: {
            type: "reading",
            reading,
            tarotCards,
            deckSystem,
            userName,
            zodiac,
            gender,
            birthDate,
            source: "ai",
            provenance,
            ...(sessionId ? { sessionId } : {}),
            ...(customQuestion
              ? { question: customQuestion, customQuestion }
              : {}),
            ...(readingIntention ? { intention: readingIntention } : {}),
            ...(isDailySpread ? { spreadType: "daily" } : {}),
            ...(isGuestResumeFree
              ? {
                  spreadType: "guest_resume",
                  guestResumeFingerprint: guestResume?.fingerprint,
                }
              : {}),
          },
          isPaid,
        });
        historyId = entry.id;

        if (isGuestResumeFree && sessionId && historyId) {
          await setGuestResumeReadingId(sessionId, authed.profileUserId, historyId);
        }

        void patchTripletInterpretation(authed.profileUserId, cardsKey, {
          text: reading,
          masterId: characterId,
        }).catch((err) => console.warn("Triplet interpretation patch failed:", err));

        try {
          await persistReadingToSession({
            sessionId,
            profileUserId: authed.profileUserId,
            characterId,
            customQuestion: customQuestion || undefined,
            reading,
            tarotCards,
            intention: intention || undefined,
            spreadType: isGuestResumeFree
              ? "guest_resume"
              : isDailySpread
                ? "daily"
                : undefined,
            spreadId: storedSpreadId,
          });
        } catch (err) {
          console.warn("Reading chat save failed:", err);
        }
      }

      return {
        kind: "new" as const,
        reading,
        historyId,
        isPaid,
        runeBalance,
      };
    };

    const lockedResult =
      lockKey && (await ensureDb())
        ? await withSpreadReadingLock(
            authed.profileUserId,
            characterId,
            lockKey,
            runLockedGeneration
          )
        : await runLockedGeneration();

    if (lockedResult.kind === "existing") {
      return respondWithExistingSpreadReading({
        existing: lockedResult.existing,
        profileUserId: authed.profileUserId,
        characterId,
        cardsKey,
        tarotCards,
        sessionId,
        intention: intention || undefined,
        spreadType: isGuestResumeFree
          ? "guest_resume"
          : isDailySpread
            ? "daily"
            : undefined,
        spreadId: storedSpreadId,
        customQuestion: customQuestion || guestResume?.question || undefined,
        userName,
        birthDate,
        isPaid: isGuestResumeFree ? true : isPaid,
      });
    }

    if (lockedResult.kind === "insufficient") {
      return insufficientRunesResponse(lockedResult.balance, lockedResult.cost);
    }

    if (lockedResult.kind === "failed") {
      await trackWorkerJobFailed(request, "Reading generation failed", {
        refunded: spentRunes > 0,
        errorCode: "generation_failed",
      });
      return NextResponse.json(
        {
          error: "Не удалось получить трактовку. Руны возвращены. Попробуйте ещё раз.",
          code: "generation_failed",
          refunded: spentRunes > 0,
        },
        { status: 502 }
      );
    }

    const successPayload = {
      reading: lockedResult.reading,
      isPaid: lockedResult.isPaid,
      historyId: lockedResult.historyId,
      runeBalance: lockedResult.runeBalance,
      spreadId: storedSpreadId,
      createdAt: new Date().toISOString(),
      ...("reportId" in lockedResult && lockedResult.reportId
        ? { reportId: lockedResult.reportId }
        : {}),
      ...("reused" in lockedResult && lockedResult.reused ? { reused: true } : {}),
      ...("matrixOwned" in lockedResult && lockedResult.matrixOwned
        ? { matrixOwned: true }
        : {}),
      ...(resolvedMatrixSubject
        ? {
            matrixSubjectId: resolvedMatrixSubject.id,
            subjectKind: resolvedMatrixSubject.kind,
            subjectName: resolvedMatrixSubject.displayName,
          }
        : {}),
      ...("numerologyUi" in lockedResult && lockedResult.numerologyUi
        ? { numerologyUi: lockedResult.numerologyUi }
        : {}),
    };
    await trackWorkerJobCompleted(request, successPayload);
    return NextResponse.json(successPayload);
  } catch (error) {
    console.error("Reading error:", error);
    const { reportError } = await import("@/lib/error-report");
    reportError(error, { route: "reading", spentRunes });
    // CFA in catch can narrow billingCharge to never; snapshot via alias.
    const chargeToRefund = billingCharge as BillingChargeResult | null;
    if (spentRunes > 0 || chargeToRefund) {
      try {
        await BillingService.rollbackCharge({
          userId: authed.profileUserId,
          cost: chargeToRefund?.spentRunes ?? spentRunes,
          wasFreeQuestion: chargeToRefund?.wasFreeQuestion ?? false,
          actionType:
            chargeToRefund?.actionType ??
            (isNumerologMaster(characterId) ? "NUMEROLOGY_SESSION" : "READING"),
          transactionId: chargeToRefund?.transactionId,
        });
        await trackWorkerJobRefunded(request);
      } catch (refundErr) {
        console.error("Reading refund failed:", refundErr);
        reportError(refundErr, { route: "reading", stage: "refund" });
      }
    }
    await trackWorkerJobFailed(request, "Reading generation failed", {
      refunded: spentRunes > 0,
      errorCode: "generation_failed",
    });
    // Fail-closed: never return template prose as a successful reading.
    return NextResponse.json(
      {
        error: "Не удалось получить трактовку. Руны возвращены. Попробуйте ещё раз.",
        code: "generation_failed",
        refunded: spentRunes > 0,
      },
      { status: 502 }
    );
  }
}
