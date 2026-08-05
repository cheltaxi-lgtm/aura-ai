import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  profileAuthFailureResponse,
  requireProfileUserId,
  resolveProfileUserContext,
} from "@/lib/require-auth";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  beginWorkerJobSave,
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";
import {
  buildAiProvenance,
  fingerprintAiInput,
  isAiCacheReusable,
} from "@/lib/ai-generation-contract";
import { resolveUnlimitedAccess, getUserReadingHistory, findCachedIntentionSpread } from "@/lib/accounts";
import { getSetting } from "@/lib/settings";
import { getRuneBalance, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
  readRequestChargeIdempotencyKey,
  type BillingChargeResult,
} from "@/lib/services/billing-service";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { getUserById, createHistoryEntry } from "@/lib/users";
import { resolveApiCharacterId, sanitizeTextField, sanitizeReadingForClient } from "@/lib/chat-sanitize";
import {
  resolveMasterDeckSystem,
  resolveSpreadDeckSystem,
} from "@/lib/decks";
import { resolveSpreadSymbols } from "@/lib/intention-draw";
import {
  buildSpreadSessionInitResponse,
  drawSeededSessionSpread,
  parsePickedIndices,
  resolveNumerologPickedSpread,
  resolveSpreadSessionSeed,
  resolveTableSize,
  type SpreadSeedParts,
} from "@/lib/spread-draw";
import { buildNumerologPickTable } from "@/lib/spread-table";
import { getSpreadRitualCopy, resolveSpreadRitualTopicLabel } from "@/lib/spread-ritual-copy";
import { isPaidSpreadTextComplete } from "@/lib/spread-reading-complete";
import {
  buildCharacterPrompt,
  buildHumanReadingPrompt,
  generateReading,
} from "@/lib/chat-prompts";
import { isAiMasterId } from "@/lib/showcase-masters";
import { getSession, updateSessionChatMeta, getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import { intentionSpreadPromptBlock } from "@/lib/intention";
import { isValidSessionIntention, topicToDrawIntention, topicLabel } from "@/lib/session-topics";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import {
  DEFAULT_NUMEROLOG_SESSION_TOOL,
  getNumerologTool,
  isNumerologSessionToolId,
  parseNumerologToolParams,
  validateNumerologSessionReady,
} from "@/lib/numerology/tools";
import { drawNumerologSessionSpread } from "@/lib/numerology/session-draw";
import { buildNumerologSessionResult } from "@/lib/numerology/session-result";
import { getNumerologSessionCopy } from "@/lib/numerology/session-copy";
import { getMatrixSubject } from "@/lib/services/matrix-subject-service";
import { toIsoBirthDate } from "@/lib/services/numerology-report-service";
import { buildMemoryContext, appendMemoryContextToPrompt } from "@/lib/memory/build-memory-context";
import {
  buildSpreadUserMessage,
  enrichCardsForSpreadContext,
  resolveIntentionLabel,
  userContextFromProfile,
} from "@/lib/prompts/user-context";
import { getSessionMemories, countSessionMemories, ensureSessionMemoryStub } from "@/lib/session-memory";
import { resolveSessionForUser, ensureChatSession } from "@/lib/session-access";
import { ensureSpreadReadingInChatMessages } from "@/lib/spread-reading-persist";
import { readSessionClaimCookie } from "@/lib/session-claim";
import { ensureSpreadCatalogSettingsLoaded } from "@/lib/spread-catalog-loader";
import { recordSpreadMetric } from "@/lib/spread-metrics-store";
import {
  getSpread,
  isSpreadSessionAllowed,
  isDailyOnlySpread,
  normalizeSpreadId,
  resolveSpreadPositions,
  logSpreadMetric,
  type SpreadId,
} from "@/lib/spreads";
import { resolveSpreadCost } from "@/lib/spreads/spread-pricing";
import { attachSpreadToJointReading, getJointReadingByToken } from "@/lib/joint-reading-service";
import { getSpreadIntentBySlug } from "@/lib/spread-intents";
import type { SessionTopicId } from "@/lib/session-topics";

async function loadSpreadSeedParts(
  request: NextRequest,
  profileUserId: string | null,
  characterId: string
): Promise<SpreadSeedParts & { topic: SessionTopicId | null }> {
  const sp = request.nextUrl.searchParams;
  const profile = profileUserId ? await getUserById(profileUserId) : null;
  const topicRaw = sp.get("topic")?.trim() ?? "";
  return {
    userId: profileUserId,
    birthDate: profile?.birth_date ?? null,
    gender: profile?.gender ?? null,
    masterId: characterId,
    topic: isValidSessionIntention(topicRaw) ? (topicRaw as SessionTopicId) : null,
    customQuestion: sanitizeTextField(sp.get("customQuestion"), 400) ?? null,
    spreadId: normalizeSpreadId(sp.get("spreadId")),
    numerologTool: sp.get("numerologTool")?.trim() || null,
    partnerDate: sp.get("partnerDate")?.trim() || null,
    reshuffleSalt: sp.get("reshuffleSalt")?.trim() || null,
  };
}

async function persistToOwnedSession(
  sessionId: string | undefined,
  profileUserId: string,
  persist: (ownedSessionId: string) => Promise<void>
): Promise<string | null> {
  if (!(await ensureDb())) return null;

  let ownedSessionId: string | undefined;

  if (sessionId) {
    const sessionClaim = await readSessionClaimCookie();
    const resolved = await resolveSessionForUser(sessionId, profileUserId, { sessionClaim });
    if (!resolved.error && resolved.session) {
      ownedSessionId = resolved.session.id;
    }
  }

  if (!ownedSessionId) {
    const ensured = await ensureChatSession(undefined, profileUserId);
    ownedSessionId = ensured.session?.id;
  }

  if (!ownedSessionId) return null;

  await persist(ownedSessionId);
  return ownedSessionId;
}

/** Preview draw — no billing, no LLM (for flip step in MasterSessionFlow). */
export async function GET(request: NextRequest) {
  await ensureSpreadCatalogSettingsLoaded();
  const authed = await requireProfileUserId();

  const poll = request.nextUrl.searchParams.get("poll") === "1";
  if (poll) {
    if (!authed) {
      return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
    }
    let characterId: string;
    try {
      characterId = await resolveApiCharacterId(
        request.nextUrl.searchParams.get("characterId")?.trim() ?? ""
      );
    } catch {
      return NextResponse.json({ error: "Unknown character" }, { status: 400 });
    }
    const intention = request.nextUrl.searchParams.get("intention")?.trim() ?? "";
    const spreadId = normalizeSpreadId(request.nextUrl.searchParams.get("spreadId"));
    const spread = getSpread(spreadId);
    const cardCount = spread.cardCount;
    const cardsRaw = request.nextUrl.searchParams.get("cards")?.trim() ?? "";
    const cardNames = cardsRaw
      .split("|")
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, cardCount);

    if (!characterId || !intention || cardNames.length < cardCount) {
      return NextResponse.json({ error: "Invalid poll request" }, { status: 400 });
    }
    if (!isValidSessionIntention(intention)) {
      return NextResponse.json({ error: "Unknown intention" }, { status: 400 });
    }

    if (!(await ensureDb())) {
      return NextResponse.json({ found: false, reading: "" });
    }

    const sessionId = request.nextUrl.searchParams.get("sessionId")?.trim() || null;
    // Custom questions must never recover a previous consultation with the same cards.
    // Topic spreads may still reuse by cards when sessionId is omitted (legacy).
    const requireSessionId = intention === "custom" || Boolean(sessionId);
    if (requireSessionId && !sessionId) {
      return NextResponse.json({ found: false, reading: "" });
    }

    const history = await getUserReadingHistory(authed.profileUserId);
    const cached = findCachedIntentionSpread(
      history,
      characterId,
      intention,
      cardNames.map((name) => ({ name })),
      spreadId,
      { sessionId, requireSessionId }
    );
    const reusable = cached && isAiCacheReusable(cached);
    const reading =
      reusable && cached?.reading?.trim()
        ? sanitizeReadingForClient(cached.reading, cardNames)
        : "";

    return NextResponse.json({
      found: Boolean(reading),
      reading,
    });
  }

  const topic = request.nextUrl.searchParams.get("topic")?.trim() ?? "";
  const rawMaster = request.nextUrl.searchParams.get("master")?.trim() ?? "veronika";
  const numerologDraw = request.nextUrl.searchParams.get("numerologDraw") === "1";
  const numerologToolRaw = request.nextUrl.searchParams.get("numerologTool")?.trim() ?? "";

  let characterId: string;
  try {
    characterId = await resolveApiCharacterId(rawMaster);
  } catch {
    return NextResponse.json({ error: "Unknown master" }, { status: 400 });
  }
  // Prefer invite depth when a joint token is present so draw/init matches POST attach.
  let spreadId = normalizeSpreadId(request.nextUrl.searchParams.get("spreadId"));
  const jointTokenGet =
    request.nextUrl.searchParams.get("jointToken")?.trim().slice(0, 64) || undefined;
  if (jointTokenGet && (await ensureDb())) {
    const joint = await getJointReadingByToken(jointTokenGet);
    if (joint && joint.status !== "expired") {
      spreadId = normalizeSpreadId(joint.spread_id);
    }
  }
  const system = isNumerologMaster(characterId)
    ? resolveMasterDeckSystem(characterId)
    : resolveSpreadDeckSystem(spreadId, characterId);

  if (isNumerologMaster(characterId)) {
    if (!authed) {
      return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
    }
    const toolId = isNumerologSessionToolId(numerologToolRaw)
      ? numerologToolRaw
      : numerologDraw
        ? DEFAULT_NUMEROLOG_SESSION_TOOL
        : null;
    if (toolId) {
      const toolParams = parseNumerologToolParams({
        partnerName: request.nextUrl.searchParams.get("partnerName"),
        partnerDate: request.nextUrl.searchParams.get("partnerDate"),
        objectValue: request.nextUrl.searchParams.get("objectValue"),
      });
      const profileUser = await getUserById(authed.profileUserId);
      let birthDate = profileUser?.birth_date ?? null;
      let fullName = profileUser?.name ?? null;
      let matrixSubjectLabel: string | null = null;
      const matrixSubjectTools =
        toolId === "destiny_matrix" ||
        toolId === "child_matrix" ||
        toolId === "matrix_year_forecast";
      const matrixSubjectIdRaw =
        request.nextUrl.searchParams.get("matrixSubjectId")?.trim() ?? "";
      const matrixSubjectId =
        matrixSubjectIdRaw && /^[0-9a-f-]{1,40}$/i.test(matrixSubjectIdRaw)
          ? matrixSubjectIdRaw
          : null;
      if (matrixSubjectTools && matrixSubjectId) {
        const subject = await getMatrixSubject(authed.profileUserId, matrixSubjectId);
        if (!subject) {
          return NextResponse.json(
            { error: "Субъект матрицы не найден.", code: "matrix_subject_forbidden" },
            { status: 403 }
          );
        }
        birthDate = toIsoBirthDate(subject.birthDate) ?? subject.birthDate;
        fullName = subject.displayName?.trim() || fullName;
        matrixSubjectLabel =
          subject.kind === "self"
            ? "Вы"
            : subject.displayName?.trim() ||
              (subject.kind === "child"
                ? "Ребёнок"
                : subject.kind === "partner"
                  ? "Партнёр"
                  : "Другой человек");
      }
      const readyError = validateNumerologSessionReady(toolId, toolParams, birthDate, fullName);
      if (readyError) {
        return NextResponse.json({ error: readyError }, { status: 400 });
      }
      if (request.nextUrl.searchParams.get("sessionInit") === "1") {
        const seedParts = await loadSpreadSeedParts(request, authed.profileUserId, characterId);
        const sessionSeed = resolveSpreadSessionSeed(seedParts);
        const numerologResult = buildNumerologSessionResult({
          toolId,
          birthDate,
          fullName,
          params: toolParams,
        });
        if (!numerologResult) {
          return NextResponse.json(
            { error: "Не удалось выполнить расчёт — проверьте профиль и параметры." },
            { status: 400 }
          );
        }
        const copy = getNumerologSessionCopy(toolId, {
          hasBirthDate: Boolean(birthDate),
          hasFullName: Boolean(fullName),
        });
        return NextResponse.json({
          sessionSeed,
          system,
          deck: system,
          numerologTool: toolId,
          numerologResult,
          matrixSubjectId: matrixSubjectId || undefined,
          matrixSubjectLabel: matrixSubjectLabel || undefined,
          ritualTitle: copy.ritualTitle,
          ritualBody: copy.ritualBody,
          drawHint: copy.revealHint,
          personalNote: copy.personalNote,
          computingHint: copy.computingHint,
        });
      }
      const pickedIndicesRaw = request.nextUrl.searchParams.get("pickedIndices")?.trim() ?? "";
      const numerologDrawCount = getNumerologTool(toolId).drawCount;
      const pickedIndicesParam =
        pickedIndicesRaw ?
          parsePickedIndices(pickedIndicesRaw, numerologDrawCount, numerologDrawCount)
        : undefined;
      const drawIndexRaw = request.nextUrl.searchParams.get("drawIndex");
      const drawIndex =
        drawIndexRaw != null && drawIndexRaw !== "" ? Number.parseInt(drawIndexRaw, 10) : undefined;
      const sessionSeedParam = request.nextUrl.searchParams.get("sessionSeed")?.trim() ?? "";
      const seedParts = await loadSpreadSeedParts(request, authed.profileUserId, characterId);
      const sessionSeed = sessionSeedParam || resolveSpreadSessionSeed(seedParts);

      const drawn = drawNumerologSessionSpread(toolId, {
        birthDate,
        fullName,
        params: toolParams,
        deckSystem: system,
      });
      if (getNumerologTool(toolId).drawCount > 0 && drawn.length < getNumerologTool(toolId).drawCount) {
        return NextResponse.json(
          { error: "Не удалось рассчитать числа — проверьте профиль и параметры." },
          { status: 400 }
        );
      }
      const ritualCopy = getSpreadRitualCopy(characterId, {
        hasBirthDate: Boolean(birthDate),
        cardCount: numerologDrawCount,
      });
      if (pickedIndicesParam?.length) {
        const tableDeck = buildNumerologPickTable(drawn, sessionSeed);
        const resolved = resolveNumerologPickedSpread(tableDeck, pickedIndicesParam, drawn);
        return NextResponse.json({
          cards: resolved.map((c) => ({ name: c.name, meaning: c.meaning })),
          system,
          deck: system,
          intention: null,
          numerologTool: toolId,
          sessionSeed,
          pickedIndices: pickedIndicesParam,
          tableSize: numerologDrawCount,
          personalNote: ritualCopy.personalNote,
          pickHint: ritualCopy.pickHint,
          drawHint: ritualCopy.drawHint,
        });
      }
      if (Number.isInteger(drawIndex) && drawIndex! >= 0) {
        const card = drawn[drawIndex!];
        if (!card) {
          return NextResponse.json({ error: "Invalid drawIndex" }, { status: 400 });
        }
        return NextResponse.json({
          cards: [{ name: card.name, meaning: card.meaning }],
          system,
          deck: system,
          intention: null,
          numerologTool: toolId,
          sessionSeed,
          drawIndex,
          personalNote: ritualCopy.personalNote,
          numerologReveal: `Число ${card.name} — совпало с вашим расчётом`,
        });
      }
      return NextResponse.json({
        cards: drawn.map((c) => ({ name: c.name, meaning: c.meaning })),
        system,
        deck: system,
        intention: null,
        numerologTool: toolId,
        sessionSeed,
        personalNote: ritualCopy.personalNote,
        ritualTitle: ritualCopy.title,
        ritualBody: ritualCopy.body,
        drawHint: ritualCopy.drawHint,
      });
    }
  }

  if (isDailyOnlySpread(spreadId)) {
    return NextResponse.json({ error: "Spread not available for sessions" }, { status: 400 });
  }
  const spread = getSpread(spreadId);

  if (!isSpreadSessionAllowed(spreadId)) {
    return NextResponse.json({ error: "Spread unavailable" }, { status: 403 });
  }

  const cardCount = spread.cardCount;

  const sessionInit = request.nextUrl.searchParams.get("sessionInit") === "1";

  if (!topic || !isValidSessionIntention(topic)) {
    return NextResponse.json({ error: "Unknown intention" }, { status: 400 });
  }

  if (!authed) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const seedParts = await loadSpreadSeedParts(request, authed.profileUserId, characterId);
  const profileUser = await getUserById(authed.profileUserId);

  if (sessionInit) {
    const intentSlugParam = request.nextUrl.searchParams.get("intentSlug")?.trim();
    const customQuestionInit = seedParts.customQuestion ?? undefined;
    const topicLabelOverride = resolveSpreadRitualTopicLabel({
      topic: topic as SessionTopicId,
      customQuestion: customQuestionInit,
      intentSlug: intentSlugParam,
    });
    const init = buildSpreadSessionInitResponse({
      ...seedParts,
      topic: topic as SessionTopicId,
      topicLabelOverride,
      hasBirthDate: Boolean(profileUser?.birth_date),
      system,
    });
    return NextResponse.json({
      ...init,
      system,
      deck: system,
      intention: topic,
      spreadId,
    });
  }

  const sessionSeedParam = request.nextUrl.searchParams.get("sessionSeed")?.trim() ?? "";
  const sessionSeed = sessionSeedParam || resolveSpreadSessionSeed(seedParts);
  const tableSize = resolveTableSize(system);
  const pickedIndicesRaw = request.nextUrl.searchParams.get("pickedIndices")?.trim() ?? "";
  const pickedIndices =
    pickedIndicesRaw ?
      parsePickedIndices(pickedIndicesRaw, tableSize, cardCount)
    : undefined;
  const drawIndexRaw = request.nextUrl.searchParams.get("drawIndex");
  const drawIndex =
    drawIndexRaw != null && drawIndexRaw !== "" ? Number.parseInt(drawIndexRaw, 10) : undefined;
  const customQuestion = seedParts.customQuestion ?? undefined;

  if (topic === "custom" && (!customQuestion || customQuestion.length < 8)) {
    return NextResponse.json({ error: "Question too short" }, { status: 400 });
  }

  const ritualCopy = getSpreadRitualCopy(characterId, {
    topic: topic as SessionTopicId,
    topicLabelOverride: resolveSpreadRitualTopicLabel({
      topic: topic as SessionTopicId,
      customQuestion,
      intentSlug: request.nextUrl.searchParams.get("intentSlug")?.trim(),
    }),
    hasBirthDate: Boolean(profileUser?.birth_date),
    cardCount,
  });

  try {
    const result = drawSeededSessionSpread({
      system,
      topic,
      customQuestion,
      cardCount,
      seed: sessionSeed,
      drawIndex: Number.isInteger(drawIndex) ? drawIndex : undefined,
      pickedIndices,
      tableSize,
    });
    return NextResponse.json({
      cards: result.cards,
      system,
      deck: system,
      intention: topic,
      spreadId,
      sessionSeed,
      drawIndex: result.drawIndex,
      pickedIndices: result.pickedIndices,
      tableSize,
      personalNote: ritualCopy.personalNote,
      pickHint: ritualCopy.pickHint,
      drawHint: ritualCopy.drawHint,
    });
  } catch {
    return NextResponse.json({ error: "Invalid draw request" }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  await ensureSpreadCatalogSettingsLoaded();
  let characterId = "ragnar";
  let intention = "";
  let customQuestion: string | undefined;
  let sessionId: string | undefined;
  let cardNames: string[] | undefined;
  let spreadId: SpreadId = "triplet";
  let jointToken: string | undefined;
  let asyncRequested = false;
  let rawBody: Record<string, unknown> = {};

  let rawCardNames: string[] | undefined;
  try {
    const body = await request.json();
    rawBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    asyncRequested = body.async === true;
    characterId = await resolveApiCharacterId(body.characterId);
    intention = sanitizeTextField(body.intention, 40) ?? "";
    customQuestion = sanitizeTextField(body.customQuestion, 400) ?? undefined;
    sessionId = body.sessionId;
    // Tokens are base64url(16 bytes) = 22 chars; keep headroom for future lengths.
    jointToken =
      typeof body.jointToken === "string" ? body.jointToken.trim().slice(0, 64) || undefined : undefined;
    spreadId = normalizeSpreadId(
      typeof body.spreadId === "string" ? body.spreadId : undefined
    );
    if (Array.isArray(body.cardNames)) {
      rawCardNames = body.cardNames
        .filter((n: unknown) => typeof n === "string" && n.trim())
        .map((n: string) => n.trim());
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    if (message.startsWith("Unknown characterId")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Resolve invite *before* slicing cards so invite depth wins over a wrong client spreadId.
  if (jointToken && (await ensureDb())) {
    const joint = await getJointReadingByToken(jointToken);
    if (!joint || joint.status === "expired") {
      // Do not fail the personal spread: the client still has the full token and
      // can attach via /complete after generation. A hard 404 here used to abort
      // every joint reading when the token was truncated or briefly unavailable.
      console.warn(
        "[intention-spread] joint invite missing/expired — continuing without attach",
        jointToken.slice(0, 8)
      );
      jointToken = undefined;
    } else {
      spreadId = normalizeSpreadId(joint.spread_id);
      // `intent_slug` is a spread-intents *registry* slug (e.g. "sovmestimost-pary"),
      // not a `SessionTopicId` — assigning it to `intention` directly used to fail
      // `isValidSessionIntention` below on every single joint-reading submission.
      // Resolve it through the registry instead, same as the client-side deep link
      // flow (which always sends `intention: "custom"` for intent-slug spreads).
      if (joint.intent_slug) {
        const jointIntent = getSpreadIntentBySlug(joint.intent_slug);
        intention = "custom";
        customQuestion =
          customQuestion ||
          jointIntent?.questionTemplate ||
          `Совместный расклад (${joint.intent_slug})`;
      }
    }
  }

  {
    const spread = getSpread(spreadId);
    if (rawCardNames) {
      cardNames = rawCardNames.slice(0, spread.cardCount);
    }
  }

  if (!characterId || !intention) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isValidSessionIntention(intention)) {
    return NextResponse.json({ error: "Unknown intention" }, { status: 400 });
  }

  if (isDailyOnlySpread(spreadId)) {
    return NextResponse.json({ error: "Spread not available for sessions" }, { status: 400 });
  }

  if (!isSpreadSessionAllowed(spreadId)) {
    return NextResponse.json({ error: "Spread unavailable" }, { status: 403 });
  }

  const spread = getSpread(spreadId);
  const cardCount = spread.cardCount;

  if (intention === "custom") {
    let q = customQuestion?.trim() ?? "";
    // Soft-fail may have cleared jointToken above — still accept a joint fallback
    // question so personal generation is not blocked by a missing invite lookup.
    if (
      q.length < 8 &&
      typeof rawBody.jointToken === "string" &&
      rawBody.jointToken.trim()
    ) {
      q = "Совместный расклад для двоих";
    }
    if (!q || q.length < 8) {
      return NextResponse.json({ error: "Question too short" }, { status: 400 });
    }
    customQuestion = q;
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

  if (!workerUserId) {
    const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "intention_spread");
    if (rateLimited) return rateLimited;
  }

  if (asyncRequested && isAsyncJobWorkerConfigured()) {
    // Fail fast on 402 before enqueue — otherwise the client ritual spins until
    // the worker charges and fails with insufficient_runes.
    const unlimitedForEnqueue = await resolveUnlimitedAccess({
      accountId: authed.auth.sub,
      profileUserId: authed.profileUserId,
    });
    const runeSettingsForEnqueue = await getRuneSettings();
    if (isRuneBillingActive(authed.profileUserId, unlimitedForEnqueue, runeSettingsForEnqueue)) {
      const spreadCost = resolveSpreadCost(spreadId, runeSettingsForEnqueue);
      const balance = await getRuneBalance(authed.profileUserId);
      if (balance < spreadCost) {
        return insufficientRunesResponse(balance, spreadCost);
      }
    }
    return enqueuePaidAsyncJob({
      userId: authed.profileUserId,
      kind: "intention_spread",
      payload: {
        ...rawBody,
        async: false,
        cardsKey: Array.isArray(cardNames) ? cardNames.join("|") : undefined,
      },
      bypassDeliveryGate: true,
    });
  }

  const system = resolveSpreadDeckSystem(spreadId, characterId);
  const positionLabels = resolveSpreadPositions(
    spreadId,
    intention as SessionTopicId
  ).map((p) => p.label);
  const serverProfile = await getUserById(authed.profileUserId);
  const userName = serverProfile?.name ?? "друг";
  const gender = serverProfile?.gender ?? "";
  const zodiac = serverProfile?.zodiac ?? "";
  const birthDate = serverProfile?.birth_date ?? "";
  const birthTime = serverProfile?.birth_time ?? undefined;
  const birthCity = serverProfile?.birth_city ?? undefined;
  const lifeFocus = serverProfile?.life_focus ?? undefined;
  const mainQuestion = serverProfile?.main_question ?? undefined;
  const astroMeta = serverProfile?.astro_meta as import("@/lib/astro-profile").AstroMeta | undefined;

  const spreadSeed = resolveSpreadSessionSeed({
    userId: authed.profileUserId,
    birthDate: birthDate || null,
    gender: gender || null,
    masterId: characterId,
    topic: intention,
    customQuestion: intention === "custom" ? customQuestion : null,
    spreadId,
  });

  const resolveDrawn = () => {
    if (cardNames?.length === cardCount) {
      const resolved = resolveSpreadSymbols(system, cardNames);
      if (resolved.length >= cardCount) return resolved;
    }
    const result = drawSeededSessionSpread({
      system,
      topic: intention,
      customQuestion: intention === "custom" ? customQuestion : undefined,
      cardCount,
      seed: spreadSeed,
    });
    return result.cards;
  };

  const drawn = resolveDrawn();
  if (drawn.length < cardCount) {
    return NextResponse.json({ error: "Could not resolve cards" }, { status: 500 });
  }

  if (intention !== "custom" && (await ensureDb())) {
    const history = await getUserReadingHistory(authed.profileUserId);
    const cached = findCachedIntentionSpread(
      history,
      characterId,
      intention,
      drawn.map((c) => ({ name: c.name })),
      spreadId
    );
    if (cached?.reading && isAiCacheReusable(cached)) {
      const cardNames = drawn.map((c) => c.name);
      const cleaned = sanitizeReadingForClient(cached.reading, cardNames);
      if (cleaned) {
        const ownedSessionId = await persistToOwnedSession(
          sessionId,
          authed.profileUserId,
          async (resolvedSessionId) => {
            await ensureSpreadReadingInChatMessages({
              sessionId: resolvedSessionId,
              profileUserId: authed.profileUserId,
              characterId,
              reading: cleaned,
              tarotCards: drawn.map((c) => ({ name: c.name })),
              intention,
              spreadType: "new",
              spreadId,
              customQuestion: intention === "custom" ? customQuestion : undefined,
            });
          }
        );

        let jointSaved = false;
        let jointError: string | undefined;
        if (jointToken && cleaned) {
          const jointResult = await attachSpreadToJointReading({
            jointToken,
            userId: authed.profileUserId,
            profileName: userName,
            spreadId,
            reading: cleaned,
            cards: drawn.map((c, i) => ({
              name: c.name,
              position: positionLabels[i] ?? c.name,
            })),
            sessionId: ownedSessionId ?? sessionId,
            characterKey: characterId,
          });
          jointSaved = jointResult.ok;
          if (!jointResult.ok) jointError = jointResult.error;
        }

        const reusedPayload = {
          reading: cleaned,
          cards: drawn,
          system,
          intention,
          spreadId,
          sessionId: ownedSessionId ?? sessionId,
          isPaid: true,
          reused: true,
          jointSaved,
          jointError,
        };
        await trackWorkerJobCompleted(request, reusedPayload);
        return NextResponse.json(reusedPayload);
      }
    }
  }

  const unlimited = await resolveUnlimitedAccess({
    accountId: authed.auth.sub,
    profileUserId: authed.profileUserId,
  });

  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(authed.profileUserId, unlimited, runeSettings);
  let billingCharge: BillingChargeResult | null = null;
  let runeBalance: number | undefined;

  if (useRuneBilling) {
    try {
      const spreadCost = resolveSpreadCost(spreadId, runeSettings);
      const charge = await BillingService.chargeForSession({
        userId: authed.profileUserId,
        cost: spreadCost,
        actionType: "INTENTION_SPREAD",
        sessionId,
        idempotencyKey:
          readRequestChargeIdempotencyKey(request, rawBody) ??
          (sessionId ? `intention-spread:${sessionId}:${spreadId}` : undefined),
      });
      billingCharge = charge;
      runeBalance = charge.newBalance;
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return insufficientFundsResponse(err);
      }
      throw err;
    }
  }

  // Charge dedupe: never re-run LLM — return cached reading or a pending resume payload.
  if (billingCharge?.deduplicated) {
    const history = await getUserReadingHistory(authed.profileUserId);
    const cached = findCachedIntentionSpread(
      history,
      characterId,
      intention,
      drawn.map((c) => ({ name: c.name })),
      spreadId,
      { sessionId, requireSessionId: intention === "custom" || Boolean(sessionId) }
    );
    if (cached?.reading && isAiCacheReusable(cached)) {
      const cleaned = sanitizeReadingForClient(
        cached.reading,
        drawn.map((c) => c.name)
      );
      if (cleaned) {
        const reusedPayload = {
          reading: cleaned,
          cards: drawn,
          system,
          intention,
          spreadId,
          sessionId: cached.sessionId ?? sessionId,
          isPaid: true,
          reused: true,
          runeBalance,
        };
        await trackWorkerJobCompleted(request, reusedPayload);
        return NextResponse.json(reusedPayload);
      }
    }
    const pendingPayload = {
      reading: "",
      pending: true,
      cards: drawn,
      system,
      intention,
      spreadId,
      sessionId,
      isPaid: true,
      reused: true,
      runeBalance,
      message: "Расклад уже выполняется — откройте сессию.",
    };
    await trackWorkerJobCompleted(request, pendingPayload);
    return NextResponse.json(pendingPayload);
  }

  if (intention === "life_death") {
    const ownedSessionId = await persistToOwnedSession(
      sessionId,
      authed.profileUserId,
      async (resolvedSessionId) => {
        const { setSessionAwaitingContext } = await import("@/lib/session");
        await setSessionAwaitingContext(resolvedSessionId, true);
        await updateSessionChatMeta(resolvedSessionId, {
          characterKey: characterId,
          intention,
          spreadType: "new",
          spreadId,
          cards: drawn.map((c) => c.name),
        });
        await ensureSessionMemoryStub({
          userId: authed.profileUserId,
          sessionId: resolvedSessionId,
          characterKey: characterId,
          topicSummary: topicLabel(intention),
          keyCards: drawn.map((c) => c.name),
          prediction: "Сеанс в процессе",
        });
      }
    );

    return NextResponse.json({
      reading: "",
      skipReading: true,
      cards: drawn,
      system,
      intention,
      spreadId,
      sessionId: ownedSessionId ?? sessionId,
      runeBalance,
      isPaid: true,
    });
  }

  // Crisis/war questions: omit textbook glosses («романтик», «ухаживание») — they hijack the plot.
  const { isCrisisSurvivalQuestion } = await import("@/lib/crisis-question");
  const crisisQ = isCrisisSurvivalQuestion(
    intention === "custom" ? customQuestion : intention
  );
  const tarotCards = drawn.map((c, i) => ({
    name: c.name,
    meaning: crisisQ
      ? `${positionLabels[i] ?? `Позиция ${i + 1}`}`
      : `${positionLabels[i] ?? `Позиция ${i + 1}`}: ${c.meaning}`,
  }));

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
    isPaid: true,
    birthTime,
    birthCity,
    lifeFocus,
    mainQuestion,
    astroMeta,
  };

  const sessionMemories = await getSessionMemories(
    authed.profileUserId,
    characterId,
    3,
    sessionId
  );
  const sessionNumber = sessionMemories.length
    ? sessionMemories.length + 1
    : (await countSessionMemories(authed.profileUserId, characterId)) + 1;

  let systemPrompt = buildCharacterPrompt(characterId, ctx, {
    sessionNumber,
    memory: [],
    intention,
    spreadId,
    customQuestion: intention === "custom" ? customQuestion : undefined,
  });

  if (!isAiMasterId(characterId) && (await ensureDb())) {
    const blogger = await getBloggerBySlug(characterId);
    if (blogger) {
      const knowledge = await getBloggerKnowledge(blogger.id);
      systemPrompt = buildHumanReadingPrompt(blogger, ctx, knowledge, intention, {
        spreadId,
        positionLabels,
      });
    }
  }

  systemPrompt += intentionSpreadPromptBlock(intention, customQuestion, {
    spreadId,
    cardCount: drawn.length,
    positionLabels,
  });

  const memoryCtx = await buildMemoryContext({
    userId: authed.profileUserId,
    characterId,
    sessionId,
    profile: {
      name: userName,
      gender,
      zodiac,
      birthDate,
      mainQuestion: intention === "custom" ? customQuestion : mainQuestion,
      lifeFocus,
    },
    intention,
    customQuestion,
    mainQuestion,
  });
  systemPrompt = appendMemoryContextToPrompt(systemPrompt, memoryCtx);

  let reading = "";
  let readingProvenance: import("@/lib/ai-generation-contract").AiProvenance | undefined;
  try {
    const userForContext = userContextFromProfile({
      name: userName,
      gender,
      birthDate,
      zodiac,
      astroMeta: astroMeta as Record<string, unknown> | undefined,
    });
    const cardsForContext = enrichCardsForSpreadContext(system, tarotCards, positionLabels, {
      omitTextbookMeanings: crisisQ,
    });
    const userMessage = buildSpreadUserMessage({
      user: userForContext,
      cards: cardsForContext,
      intention:
        intention === "custom" && customQuestion
          ? customQuestion
          : resolveIntentionLabel(intention),
    });

    const generated = await generateReading(systemPrompt, {
      userName,
      tarotCards,
      isPaid: true,
      characterId,
      intention,
      spreadId,
      positionLabels,
      userMessage,
    });
    readingProvenance = generated.provenance;
    reading =
      sanitizeReadingForClient(generated.text.trim(), drawn.map((c) => c.name)) || "";
    const cardNamesForCheck = drawn.map((c) => c.name);
    const readingOk =
      generated.fromLlm &&
      Boolean(reading.trim()) &&
      isPaidSpreadTextComplete(reading, cardNamesForCheck);
    if (!readingOk) {
      throw new Error("intention_spread_ai_failed");
    }
  } catch (err) {
    console.error("Intention spread generation failed:", err);
    let refunded = false;
    if (billingCharge) {
      try {
        runeBalance = await BillingService.rollbackCharge({
          userId: authed.profileUserId,
          cost: billingCharge.spentRunes,
          wasFreeQuestion: billingCharge.wasFreeQuestion,
          actionType: "INTENTION_SPREAD",
          transactionId: billingCharge.transactionId,
        });
        refunded = true;
      } catch (refundErr) {
        console.error("Intention spread refund failed:", refundErr);
      }
      billingCharge = null;
    }
    await trackWorkerJobFailed(request, "Intention spread generation failed", {
      refunded,
      errorCode: "generation_failed",
    });
    return NextResponse.json(
      {
        error: "Не удалось получить трактовку. Руны возвращены. Попробуйте ещё раз.",
        code: "generation_failed",
        refunded,
      },
      { status: 502 }
    );
  }

  const ownedSessionId = await persistToOwnedSession(
    sessionId,
    authed.profileUserId,
    async (resolvedSessionId) => {
      if (reading.trim()) {
        await ensureSpreadReadingInChatMessages({
          sessionId: resolvedSessionId,
          profileUserId: authed.profileUserId,
          characterId,
          reading: reading.trim(),
          tarotCards: drawn.map((c) => ({ name: c.name })),
          intention,
          spreadType: "new",
          spreadId,
          customQuestion: intention === "custom" ? customQuestion : undefined,
        });
      } else {
        await updateSessionChatMeta(resolvedSessionId, {
          characterKey: characterId,
          intention,
          spreadType: "new",
          spreadId,
          cards: drawn.map((c) => c.name),
        });
        await ensureSessionMemoryStub({
          userId: authed.profileUserId,
          sessionId: resolvedSessionId,
          characterKey: characterId,
          topicSummary: topicLabel(intention),
          keyCards: drawn.map((c) => c.name),
          prediction: "Сеанс в процессе",
        });
      }
    }
  );
  const storedSessionId = ownedSessionId ?? sessionId;

  if (await ensureDb()) {
    try {
      if (!(await beginWorkerJobSave(request))) {
        if (billingCharge) {
          try {
            await BillingService.rollbackCharge({
              userId: authed.profileUserId,
              cost: billingCharge.spentRunes,
              wasFreeQuestion: billingCharge.wasFreeQuestion,
              actionType: "INTENTION_SPREAD",
              transactionId: billingCharge.transactionId,
            });
          } catch (refundErr) {
            console.error("Intention spread refund failed:", refundErr);
          }
        }
        await trackWorkerJobFailed(request, "Intention spread save race", {
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
      const aiSettings = await getSetting("ai");
      const provenance =
        readingProvenance ??
        buildAiProvenance({
          model: String(aiSettings.paidModel || aiSettings.model || "unknown"),
          attempts: 1,
          finishReason: "stop",
          inputFingerprint: fingerprintAiInput([
            characterId,
            intention,
            spreadId,
            drawn.map((c) => c.name),
          ]),
          content: reading,
        });
      await createHistoryEntry({
        userId: authed.profileUserId,
        characterName: characterId,
        isPaid: true,
        contextData: {
          type: "intention_spread",
          intention,
          spreadId,
          customQuestion: intention === "custom" ? customQuestion : undefined,
          reading,
          tarotCards,
          deckSystem: system,
          system,
          sessionId: storedSessionId,
          source: "ai",
          provenance,
        },
      });
    } catch (histErr) {
      console.warn("Intention spread history save failed:", histErr);
    }
  }

  logSpreadMetric(
    "spread_completed",
    {
      spreadId,
      intention,
      characterId,
      cardCount,
      cost: billingCharge?.spentRunes,
      source: "intention_spread",
    }
  );

  let jointSaved = false;
  let jointError: string | undefined;

  if (jointToken && reading?.trim()) {
    const jointResult = await attachSpreadToJointReading({
      jointToken,
      userId: authed.profileUserId,
      profileName: userName,
      spreadId,
      reading: reading.trim(),
      cards: drawn.map((c, i) => ({
        name: c.name,
        position: positionLabels[i] ?? c.name,
      })),
      sessionId: storedSessionId ?? undefined,
      characterKey: characterId,
    });
    jointSaved = jointResult.ok;
    if (!jointResult.ok) {
      jointError = jointResult.error;
      console.warn("Joint reading attach failed:", jointResult.error);
    }
  }

  await recordSpreadMetric(
    "spread_completed",
    {
      spreadId,
      intention,
      characterId,
      cardCount,
      cost: billingCharge?.spentRunes,
      source: "intention_spread",
    },
    authed.profileUserId
  );

  const successPayload = {
    reading,
    cards: drawn,
    system,
    intention,
    spreadId,
    sessionId: storedSessionId,
    runeBalance,
    isPaid: true,
    jointSaved,
    jointError,
  };
  await trackWorkerJobCompleted(request, successPayload);
  return NextResponse.json(successPayload);
}