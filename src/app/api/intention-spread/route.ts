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
  getDeckPositions,
  resolveMasterDeckSystem,
} from "@/lib/decks";
import { drawIntentionSpread, resolveSpreadSymbols, drawUniformSpread } from "@/lib/intention-draw";
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
import { isValidSessionIntention, topicToDrawKey, topicLabel } from "@/lib/session-topics";
import { isNumerologMaster } from "@/lib/numerolog/welcome";
import { appendUserMemoryToPrompt, buildClientBlock, buildMemoryBlock } from "@/lib/user-memory";
import { loadClientMemoryBlock } from "@/lib/memory/client-memory";
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
  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const poll = request.nextUrl.searchParams.get("poll") === "1";
  if (poll) {
    let characterId: string;
    try {
      characterId = await resolveApiCharacterId(
        request.nextUrl.searchParams.get("characterId")?.trim() ?? ""
      );
    } catch {
      return NextResponse.json({ error: "Unknown character" }, { status: 400 });
    }
    const intention = request.nextUrl.searchParams.get("intention")?.trim() ?? "";
    const cardsRaw = request.nextUrl.searchParams.get("cards")?.trim() ?? "";
    const cardNames = cardsRaw
      .split("|")
      .map((n) => n.trim())
      .filter(Boolean)
      .slice(0, 3);

    if (!characterId || !intention || cardNames.length < 3) {
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
      cardNames.map((name) => ({ name }))
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

  const characterId = await resolveApiCharacterId(rawMaster);
  const system = resolveMasterDeckSystem(characterId);

  if (isNumerologMaster(characterId) && numerologDraw) {
    const drawn = drawUniformSpread(system, 3);
    return NextResponse.json({
      cards: drawn,
      system,
      deck: system,
      intention: null,
    });
  }

  if (!topic || !isValidSessionIntention(topic)) {
    return NextResponse.json({ error: "Unknown intention" }, { status: 400 });
  }

  const drawn = drawIntentionSpread(system, topicToDrawKey(topic), 3);

  return NextResponse.json({
    cards: drawn,
    system,
    deck: system,
    intention: topic,
  });
}

export async function POST(request: NextRequest) {
  let characterId = "ragnar";
  let intention = "";
  let sessionId: string | undefined;
  let cardNames: string[] | undefined;

  try {
    const body = await request.json();
    characterId = await resolveApiCharacterId(body.characterId);
    intention = sanitizeTextField(body.intention, 40) ?? "";
    sessionId = body.sessionId;
    if (Array.isArray(body.cardNames)) {
      cardNames = body.cardNames
        .filter((n: unknown) => typeof n === "string" && n.trim())
        .map((n: string) => n.trim())
        .slice(0, 3);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid JSON";
    if (message.startsWith("Unknown characterId")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!characterId || !intention) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!isValidSessionIntention(intention)) {
    return NextResponse.json({ error: "Unknown intention" }, { status: 400 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "intention_spread");
  if (rateLimited) return rateLimited;

  const system = resolveMasterDeckSystem(characterId);
  const positions = getDeckPositions(system);
  const drawKey = topicToDrawKey(intention);

  const resolveDrawn = () => {
    if (cardNames?.length === 3) {
      const resolved = resolveSpreadSymbols(system, cardNames);
      if (resolved.length >= 3) return resolved;
    }
    return drawIntentionSpread(system, drawKey, 3);
  };

  const drawn = resolveDrawn();
  if (drawn.length < 3) {
    return NextResponse.json({ error: "Could not resolve cards" }, { status: 500 });
  }

  if (await ensureDb()) {
    const history = await getUserReadingHistory(authed.profileUserId);
    const cached = findCachedIntentionSpread(
      history,
      characterId,
      intention,
      drawn.map((c) => ({ name: c.name }))
    );
    if (cached?.reading) {
      const cardNames = drawn.map((c) => c.name);
      const cleaned = sanitizeReadingForClient(cached.reading, cardNames);
      if (cleaned) {
        await persistToOwnedSession(sessionId, authed.profileUserId, async (ownedSessionId) => {
          await ensureSpreadReadingInChatMessages({
            sessionId: ownedSessionId,
            profileUserId: authed.profileUserId,
            characterId,
            reading: cleaned,
            tarotCards: drawn.map((c) => ({ name: c.name })),
            intention,
            spreadType: "new",
          });
        });
        return NextResponse.json({
          reading: cleaned,
          cards: drawn,
          system,
          intention,
          isPaid: true,
          reused: true,
        });
      }
    }
  }

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
      const charge = await BillingService.chargeRuneAction({
        userId: authed.profileUserId,
        action: "INTENTION_SPREAD",
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
    await persistToOwnedSession(sessionId, authed.profileUserId, async (ownedSessionId) => {
      const { setSessionAwaitingContext } = await import("@/lib/session");
      await setSessionAwaitingContext(ownedSessionId, true);
      await updateSessionChatMeta(ownedSessionId, {
        characterKey: characterId,
        intention,
        spreadType: "new",
        cards: drawn.map((c) => c.name),
      });
      await ensureSessionMemoryStub({
        userId: authed.profileUserId,
        sessionId: ownedSessionId,
        characterKey: characterId,
        topicSummary: topicLabel(intention),
        keyCards: drawn.map((c) => c.name),
        prediction: "Сеанс в процессе",
      });
    });

    return NextResponse.json({
      reading: "",
      skipReading: true,
      cards: drawn,
      system,
      intention,
      runeBalance,
      isPaid: true,
    });
  }

  const tarotCards = drawn.map((c, i) => ({
    name: c.name,
    meaning: `${positions[i] ?? `Позиция ${i + 1}`}: ${c.meaning}`,
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
  });

  if (!isAiMasterId(characterId) && (await ensureDb())) {
    const blogger = await getBloggerBySlug(characterId);
    if (blogger) {
      const knowledge = await getBloggerKnowledge(blogger.id);
      systemPrompt = buildHumanReadingPrompt(blogger, ctx, knowledge, intention);
    }
  }

  systemPrompt += intentionSpreadPromptBlock(intention);

  const clientBlock = buildClientBlock({
    name: userName,
    gender,
    zodiac,
    birthDate,
    mainQuestion,
    lifeFocus,
  });
  const memoryBlock = sessionId
    ? await buildMemoryBlock(authed.profileUserId, characterId, sessionId)
    : "";
  const factsBlock = await loadClientMemoryBlock({
    userId: authed.profileUserId,
    queryText: mainQuestion ?? "",
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
    const cardsForContext = enrichCardsForSpreadContext(system, tarotCards, positions);
    const userMessage = buildSpreadUserMessage({
      user: userForContext,
      cards: cardsForContext,
      intention: resolveIntentionLabel(intention),
    });

    const generated = await generateReading(systemPrompt, {
      userName,
      tarotCards,
      isPaid: true,
      characterId,
      intention,
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
    });
  }

  if (await ensureDb()) {
    try {
      await createHistoryEntry({
        userId: authed.profileUserId,
        characterName: characterId,
        isPaid: true,
        contextData: {
          type: "intention_spread",
          intention,
          reading,
          tarotCards,
          deckSystem: system,
          system,
          sessionId,
        },
      });
    } catch (histErr) {
      console.warn("Intention spread history save failed:", histErr);
    }
  }

  await persistToOwnedSession(sessionId, authed.profileUserId, async (ownedSessionId) => {
    if (reading.trim()) {
      await ensureSpreadReadingInChatMessages({
        sessionId: ownedSessionId,
        profileUserId: authed.profileUserId,
        characterId,
        reading: reading.trim(),
        tarotCards: drawn.map((c) => ({ name: c.name })),
        intention,
        spreadType: "new",
      });
    } else {
      await updateSessionChatMeta(ownedSessionId, {
        characterKey: characterId,
        intention,
        spreadType: "new",
        cards: drawn.map((c) => c.name),
      });
      await ensureSessionMemoryStub({
        userId: authed.profileUserId,
        sessionId: ownedSessionId,
        characterKey: characterId,
        topicSummary: topicLabel(intention),
        keyCards: drawn.map((c) => c.name),
        prediction: "Сеанс в процессе",
      });
    }
  });

  return NextResponse.json({
    reading,
    cards: drawn,
    system,
    intention,
    runeBalance,
    isPaid: true,
  });
}
