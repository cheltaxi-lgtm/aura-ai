import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
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
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { getUserById, createHistoryEntry } from "@/lib/users";
import { getUserReadingHistory, findCachedIntentionSpread } from "@/lib/accounts";
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
import { getSpreadRitualCopy } from "@/lib/spread-ritual-copy";
import { isPaidSpreadTextComplete } from "@/lib/spread-reading-complete";
import {
  buildCharacterPrompt,
  buildHumanReadingPrompt,
  generateReading,
  fallbackReading,
  buildCardAwareFallbackReading,
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
import { appendUserMemoryToPrompt, buildClientBlock, buildMemoryBlock } from "@/lib/user-memory";
import { loadClientMemoryBlock } from "@/lib/memory/client-memory";
import { composeMemoryQueryText } from "@/lib/memory/memory-relevance";
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

    const history = await getUserReadingHistory(authed.profileUserId);
    const cached = findCachedIntentionSpread(
      history,
      characterId,
      intention,
      cardNames.map((name) => ({ name })),
      spreadId
    );
    const reading =
      cached?.reading?.trim() ?
        sanitizeReadingForClient(cached.reading, cardNames) || cached.reading.trim()
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
  const spreadId = normalizeSpreadId(request.nextUrl.searchParams.get("spreadId"));
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
      const birthDate = profileUser?.birth_date ?? null;
      const fullName = profileUser?.name ?? null;
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
    const init = buildSpreadSessionInitResponse({
      ...seedParts,
      topic: topic as SessionTopicId,
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

  try {
    const body = await request.json();
    characterId = await resolveApiCharacterId(body.characterId);
    intention = sanitizeTextField(body.intention, 40) ?? "";
    customQuestion = sanitizeTextField(body.customQuestion, 400) ?? undefined;
    sessionId = body.sessionId;
    jointToken =
      typeof body.jointToken === "string" ? body.jointToken.trim().slice(0, 20) || undefined : undefined;
    spreadId = normalizeSpreadId(
      typeof body.spreadId === "string" ? body.spreadId : undefined
    );
    const spread = getSpread(spreadId);
    const cardCount = spread.cardCount;
    if (Array.isArray(body.cardNames)) {
      cardNames = body.cardNames
        .filter((n: unknown) => typeof n === "string" && n.trim())
        .map((n: string) => n.trim())
        .slice(0, cardCount);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    if (message.startsWith("Unknown characterId")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (jointToken && (await ensureDb())) {
    const joint = await getJointReadingByToken(jointToken);
    if (!joint || joint.status === "expired") {
      return NextResponse.json(
        { error: "Совместное приглашение не найдено или истекло." },
        { status: 404 }
      );
    }
    spreadId = normalizeSpreadId(joint.spread_id);
    if (joint.intent_slug) {
      intention = sanitizeTextField(joint.intent_slug, 40) ?? intention;
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
    const q = customQuestion?.trim();
    if (!q || q.length < 8) {
      return NextResponse.json({ error: "Question too short" }, { status: 400 });
    }
    customQuestion = q;
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "intention_spread");
  if (rateLimited) return rateLimited;

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
    if (cached?.reading) {
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

        return NextResponse.json({
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
        });
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

  const tarotCards = drawn.map((c, i) => ({
    name: c.name,
    meaning: `${positionLabels[i] ?? `Позиция ${i + 1}`}: ${c.meaning}`,
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

  systemPrompt += intentionSpreadPromptBlock(intention, customQuestion);

  const memoryQuery = composeMemoryQueryText({
    intention,
    customQuestion,
    mainQuestion,
  });
  const clientBlock = buildClientBlock(
    {
      name: userName,
      gender,
      zodiac,
      birthDate,
      mainQuestion: intention === "custom" ? customQuestion : mainQuestion,
      lifeFocus,
    },
    memoryQuery
  );
  const memoryBlock = sessionId
    ? await buildMemoryBlock(
        authed.profileUserId,
        characterId,
        sessionId,
        memoryQuery
      )
    : "";
  const factsBlock = await loadClientMemoryBlock({
    userId: authed.profileUserId,
    queryText: memoryQuery,
  });
  systemPrompt = appendUserMemoryToPrompt(
    systemPrompt,
    `${clientBlock}${memoryBlock}${factsBlock}`.trim() || null
  );

  let reading: string;
  try {
    const userForContext = userContextFromProfile({
      name: userName,
      gender,
      birthDate,
      zodiac,
      astroMeta: astroMeta as Record<string, unknown> | undefined,
    });
    const cardsForContext = enrichCardsForSpreadContext(system, tarotCards, positionLabels);
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
    reading = generated.text.trim();
    reading =
      sanitizeReadingForClient(reading, drawn.map((c) => c.name)) ||
      buildCardAwareFallbackReading(characterId, {
        userName,
        tarotCards,
        intention,
        isPaid: true,
        spreadId,
        positionLabels,
      });
  } catch (err) {
    console.error("Intention spread generation failed:", err);
    reading = fallbackReading(characterId, {
      userName,
      isPaid: true,
      tarotCards,
      intention,
    });
  }

  if (!reading.trim()) {
    reading = buildCardAwareFallbackReading(characterId, {
      userName,
      tarotCards,
      intention,
      isPaid: true,
      spreadId,
      positionLabels,
    });
  }

  const cardNamesForCheck = drawn.map((c) => c.name);
  if (!isPaidSpreadTextComplete(reading, cardNamesForCheck)) {
    reading = buildCardAwareFallbackReading(characterId, {
      userName,
      tarotCards,
      intention,
      isPaid: true,
      spreadId,
      positionLabels,
    });
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

  return NextResponse.json({
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
  });
}