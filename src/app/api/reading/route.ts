import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { ensureDb } from "@/lib/db";
import { hasPaidAccess, unlockSingleSession, getSessionMessagesForLlm } from "@/lib/session";
import { buildCharacterPrompt, buildHumanReadingPrompt, generateReading, fallbackReading } from "@/lib/chat-prompts";
import { isAiMasterId } from "@/lib/showcase-masters";
import { getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import { requireProfileUserId } from "@/lib/require-auth";
import { resolveUnlimitedAccess } from "@/lib/accounts";
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
import { resolveApiCharacterId, sanitizeTextField, stripMemoryLeakFromReply, sanitizeReadingForClient } from "@/lib/chat-sanitize";
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
import { destinyMatrix, MATRIX_CALCULATION_VERSION } from "@/lib/numerology/destiny-matrix";
import {
  findOwnedMatrixReport,
  MATRIX_REPORT_TOOL_ID,
  saveMatrixReport,
} from "@/lib/services/numerology-report-service";
import { ensureSpreadReadingInChatMessages } from "@/lib/spread-reading-persist";
import {
  periodSpreadPositions,
  periodSpreadTaskLabel,
  type PeriodSpreadScope,
} from "@/lib/master-quick-chips";
import { isPaidSpreadTextComplete } from "@/lib/spread-reading-complete";
import { normalizeSpreadId, resolveSpreadPositions } from "@/lib/spreads";
import type { SessionTopicId } from "@/lib/session-topics";
import {
  completeAsyncJob,
  createAsyncJob,
  failAsyncJob,
  markAsyncJobRunning,
} from "@/lib/async-jobs";

async function persistReadingToSession(input: {
  sessionId: string | undefined;
  profileUserId: string;
  characterId: string;
  reading: string;
  tarotCards: { name: string }[];
  intention?: string;
  spreadType?: "daily" | "new";
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
    spreadType: input.spreadType,
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
  spreadType?: "daily" | "new";
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

export const maxDuration = 90;

export async function POST(request: NextRequest) {
  let characterId = "ragnar";
  let userName = "друг";
  let gender = "";
  let zodiac = "";
  let birthDate = "";
  let tarotCards: { name: string; meaning: string }[] = [];
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

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  if (intention === "life_death") {
    return NextResponse.json({ reading: "", skipReading: true });
  }

  const serverProfile = await getUserById(authed.profileUserId);
  if (serverProfile) {
    userName = serverProfile.name;
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

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "reading");
  if (rateLimited) return rateLimited;

  if (asyncRequested) {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }
    const jobPayload = { ...rawBody, async: false };
    const jobId = await createAsyncJob({
      userId: authed.profileUserId,
      kind: "reading",
      payload: jobPayload,
    });
    after(async () => {
      await markAsyncJobRunning(jobId);
      try {
        const innerReq = new NextRequest(request.url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            cookie: request.headers.get("cookie") ?? "",
          },
          body: JSON.stringify(jobPayload),
        });
        const res = await POST(innerReq);
        const data = (await res.json()) as Record<string, unknown> & { error?: string };
        if (!res.ok) {
          await failAsyncJob(jobId, data.error ?? `HTTP ${res.status}`);
          return;
        }
        await completeAsyncJob(jobId, data);
      } catch (err) {
        await failAsyncJob(jobId, err instanceof Error ? err.message : "reading job failed");
      }
    });
    return NextResponse.json(
      { jobId, status: "pending", pollUrl: `/api/jobs/${jobId}` },
      { status: 202 }
    );
  }

  let spentRunes = 0;
  let billingCharge: BillingChargeResult | null = null;
  let resolvedSession: Awaited<ReturnType<typeof resolveSessionForUser>>["session"] = null;

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
      intention: intention || null,
      spreadId,
      natalChartBlock,
    });

    if (!isAiMasterId(characterId) && (await ensureDb())) {
      const blogger = await getBloggerBySlug(characterId);
      if (blogger) {
        const knowledge = await getBloggerKnowledge(blogger.id);
        systemPrompt = buildHumanReadingPrompt(blogger, ctx, knowledge, intention || null, {
          spreadId,
          positionLabels,
        });
      }
    }

    if (intention) {
      systemPrompt += intentionReadingPromptBlock(intention);
    }

    const cardsKey =
      isNumerologMaster(characterId) && requestNumerologToolId
        ? numerologReadingCacheKey({
            characterId,
            toolId: requestNumerologToolId,
            birthDate,
            cardNames: tarotCards.map((c) => c.name),
            params: numerologToolParams,
          })
        : tarotCardsKey(tarotCards);
    const isDailySpread = await resolveIsDailyFreeReading({
      profileUserId: authed.profileUserId,
      spreadType,
      intention,
      sessionId,
      tarotCards,
      session: resolvedSession,
    });
    if (isDailySpread) {
      spreadType = "daily";
      isPaid = true;
    }
    let historyId: string | undefined;
    let reading: string;

    if (await ensureDb() && cardsKey && !forceRegenerate) {
      const existing = await findSpreadReadingEntry(
        authed.profileUserId,
        characterId,
        cardsKey
      );
      if (existing) {
        return respondWithExistingSpreadReading({
          existing,
          profileUserId: authed.profileUserId,
          characterId,
          cardsKey,
          tarotCards,
          sessionId,
          intention: intention || undefined,
          spreadType: isDailySpread ? "daily" : undefined,
          spreadId: storedSpreadId,
          customQuestion: customQuestion || undefined,
          userName,
          birthDate,
          isPaid,
        });
      }
    }

    const runLockedGeneration = async () => {
      if (await ensureDb() && cardsKey && !forceRegenerate) {
        const existing = await findSpreadReadingEntry(
          authed.profileUserId,
          characterId,
          cardsKey
        );
        if (existing) {
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

        const isDestinyMatrix = toolId === MATRIX_REPORT_TOOL_ID;
        let runeBalance: number | undefined;
        let numerologyUi:
          | { pythagorasSquare?: import("@/lib/numerology/pythagoras-square").PythagorasSquareResult }
          | undefined;

        // Buy-once Full Matrix: reopen saved AI report for THIS birth date only.
        if (isDestinyMatrix && (await ensureDb())) {
          const { toIsoBirthDate } = await import("@/lib/services/numerology-report-service");
          const isoBirth =
            toIsoBirthDate(birthDate) ?? toIsoBirthDate(String(birthDate).slice(0, 10));
          const owned = await findOwnedMatrixReport(
            authed.profileUserId,
            isoBirth ?? birthDate
          );
          if (owned?.content?.trim()) {
            reading = owned.content;
            isPaid = true;
            if (await ensureDb()) {
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
              historyId: owned.id,
              isPaid: true,
              runeBalance: undefined,
              numerologyUi,
              reused: true,
              matrixOwned: true,
            };
          }
        }

        const runeSettings = await getRuneSettings();
        // Skip charge only when this birth date already has a saved full report.
        let matrixOwnedSkipCharge = false;
        if (isDestinyMatrix && (await ensureDb())) {
          const ownedRow = await findOwnedMatrixReport(authed.profileUserId, birthDate);
          matrixOwnedSkipCharge = Boolean(ownedRow?.content?.trim());
        }
        const useRuneBilling =
          !isDailySpread &&
          !matrixOwnedSkipCharge &&
          isRuneBillingActive(authed.profileUserId, unlimited, runeSettings);

        if (useRuneBilling) {
          try {
            const charge = await BillingService.chargeForSession({
              userId: authed.profileUserId,
              cost: tool.cost,
              actionType: "NUMEROLOGY_SESSION",
              description: isDestinyMatrix
                ? `Матрица судьбы — полный разбор Эвелины`
                : `${tool.label} (Эвелина)`,
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
          if (sessionId && !isDestinyMatrix) {
            await unlockSingleSession(sessionId);
          }
        }

        try {
          const sessionResult = await generateNumerologSessionReading({
            toolId,
            toolParams: numerologToolParams,
            userName,
            birthDate,
            fullName: userName,
            spreadNumbers,
          });
          reading = sessionResult.reply;
          numerologyUi = sessionResult.numerologyUi;
        } catch (genErr) {
          console.error("Numerolog session reading failed:", genErr);
          if (billingCharge) {
            await BillingService.rollbackCharge({
              userId: authed.profileUserId,
              cost: billingCharge.spentRunes,
              wasFreeQuestion: false,
              actionType: "NUMEROLOGY_SESSION",
              transactionId: billingCharge.transactionId,
            });
            billingCharge = null;
            spentRunes = 0;
          }
          return { kind: "failed" as const };
        }

        if (isDestinyMatrix && (await ensureDb())) {
          try {
            const matrix = birthDate ? destinyMatrix(birthDate) : null;
            const saved = await saveMatrixReport({
              userId: authed.profileUserId,
              birthDateRaw: birthDate,
              content: reading,
              runeCost: billingCharge?.spentRunes ?? tool.cost,
              chargeTransactionId: billingCharge?.transactionId,
              sessionId,
              structuredData: matrix
                ? {
                    version: MATRIX_CALCULATION_VERSION,
                    matrix,
                  }
                : { version: MATRIX_CALCULATION_VERSION },
            });
            if (saved.status === "already_saved") {
              reading = saved.report.content;
              if (billingCharge) {
                await BillingService.rollbackCharge({
                  userId: authed.profileUserId,
                  cost: billingCharge.spentRunes,
                  wasFreeQuestion: false,
                  actionType: "NUMEROLOGY_SESSION",
                  transactionId: billingCharge.transactionId,
                });
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
                actionType: "NUMEROLOGY_SESSION",
                transactionId: billingCharge.transactionId,
              });
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
        intention: resolveIntentionLabel(intention || null),
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
      reading =
        sanitizeReadingForClient(
          stripMemoryLeakFromReply(generated.text) || generated.text,
          tarotCards.map((c) => c.name)
        ) ||
        fallbackReading(characterId, {
          userName,
          isPaid,
          tarotCards,
          intention: intention || null,
        });

      if (!isPaidSpreadTextComplete(reading, tarotCards.map((c) => c.name))) {
        reading = fallbackReading(characterId, {
          userName,
          isPaid,
          tarotCards,
          intention: intention || null,
        });
      }

      if (!reading?.trim()) {
        if (billingCharge) {
          runeBalance = await BillingService.rollbackCharge({
            userId: authed.profileUserId,
            cost: billingCharge.spentRunes,
            wasFreeQuestion: billingCharge.wasFreeQuestion,
            actionType: "READING",
          });
          billingCharge = null;
          spentRunes = 0;
        }
        return { kind: "failed" as const };
      }

      if (await ensureDb()) {
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
            ...(isDailySpread ? { spreadType: "daily" } : {}),
          },
          isPaid,
        });
        historyId = entry.id;

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
            spreadType: isDailySpread ? "daily" : undefined,
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
      cardsKey && (await ensureDb())
        ? await withSpreadReadingLock(
            authed.profileUserId,
            characterId,
            cardsKey,
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
        spreadType: isDailySpread ? "daily" : undefined,
        spreadId: storedSpreadId,
        customQuestion: customQuestion || undefined,
        userName,
        birthDate,
        isPaid,
      });
    }

    if (lockedResult.kind === "insufficient") {
      return insufficientRunesResponse(lockedResult.balance, lockedResult.cost);
    }

    if (lockedResult.kind === "failed") {
      return NextResponse.json({ error: "Reading generation failed" }, { status: 502 });
    }

    return NextResponse.json({
      reading: lockedResult.reading,
      isPaid: lockedResult.isPaid,
      historyId: lockedResult.historyId,
      runeBalance: lockedResult.runeBalance,
      spreadId: storedSpreadId,
      createdAt: new Date().toISOString(),
      ...("reused" in lockedResult && lockedResult.reused ? { reused: true } : {}),
      ...("matrixOwned" in lockedResult && lockedResult.matrixOwned
        ? { matrixOwned: true }
        : {}),
      ...("numerologyUi" in lockedResult && lockedResult.numerologyUi
        ? { numerologyUi: lockedResult.numerologyUi }
        : {}),
    });
  } catch (error) {
    console.error("Reading error:", error);
    if (spentRunes > 0) {
      try {
        await BillingService.rollbackCharge({
          userId: authed.profileUserId,
          cost: spentRunes,
          wasFreeQuestion: false,
          actionType: "READING",
        });
      } catch (refundErr) {
        console.error("Reading refund failed:", refundErr);
      }
    }
    const reading = fallbackReading(characterId, { userName, isPaid, tarotCards });
    return NextResponse.json({ reading, isPaid, fallback: true });
  }
}
