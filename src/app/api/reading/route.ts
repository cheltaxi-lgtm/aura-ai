import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { hasPaidAccess, saveMessage, unlockSingleSession } from "@/lib/session";
import { buildCharacterPrompt, buildHumanReadingPrompt, generateReading, fallbackReading } from "@/lib/chat-prompts";
import { isAiMasterId } from "@/lib/showcase-masters";
import { getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import { requireProfileUserId } from "@/lib/require-auth";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { spendRunesAtomic, refundRunes, isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { resolveSessionForUser } from "@/lib/session-access";
import { enforcePaidRouteRateLimit } from "@/lib/api-guards";
import { insufficientRunesResponse } from "@/lib/insufficient-runes";
import { createHistoryEntry, patchTripletInterpretation, getUserById } from "@/lib/users";
import { getUserReadingHistory } from "@/lib/accounts";
import { tarotCardsKey } from "@/lib/tarot";
import {
  appendUserMemoryToPrompt,
  buildClientBlock,
  buildMemoryBlock,
} from "@/lib/user-memory";
import {
  buildSpreadUserMessage,
  enrichCardsForSpreadContext,
  resolveIntentionLabel,
  userContextFromProfile,
} from "@/lib/prompts/user-context";
import { getSessionMemories, countSessionMemories } from "@/lib/session-memory";
import { resolveApiCharacterId, sanitizeTextField, stripMemoryLeakFromReply, sanitizeReadingForClient } from "@/lib/chat-sanitize";
import { resolveMasterDeckSystem } from "@/lib/decks";
import { INTENTION_OPTIONS, intentionPromptBlock, intentionReadingPromptBlock } from "@/lib/intention";
import { isValidSessionIntention } from "@/lib/session-topics";

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
  let forceRegenerate = false;

  try {
    const body = await request.json();
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
    forceRegenerate = body.forceRegenerate === true;
  } catch (error) {
    console.error("Reading JSON error:", error);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!characterId || !userName || !tarotCards?.length) {
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
    birthDate = serverProfile.birth_date;
    birthTime = serverProfile.birth_time ?? undefined;
    birthCity = serverProfile.birth_city ?? undefined;
    lifeFocus = serverProfile.life_focus ?? undefined;
    mainQuestion = serverProfile.main_question ?? undefined;
    astroMeta = serverProfile.astro_meta as import("@/lib/astro-profile").AstroMeta;
  }

  const rateLimited = await enforcePaidRouteRateLimit(authed.auth.sub, "reading");
  if (rateLimited) return rateLimited;

  let spentRunes = 0;

  try {
    const unlimited = await resolveUnlimitedAccess({
      accountId: authed.auth.sub,
      profileUserId: authed.profileUserId,
    });

    if (await ensureDb()) {
      if (sessionId) {
        const resolved = await resolveSessionForUser(sessionId, authed.profileUserId);
        if (resolved.error) return resolved.error;
        const session = resolved.session!;
        isPaid = hasPaidAccess(session, { unlimited });
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

    let systemPrompt = buildCharacterPrompt(characterId, ctx, {
      sessionNumber,
      memory: sessionMemories,
      intention: intention || null,
    });

    if (!isAiMasterId(characterId) && (await ensureDb())) {
      const blogger = await getBloggerBySlug(characterId);
      if (blogger) {
        const knowledge = await getBloggerKnowledge(blogger.id);
        systemPrompt = buildHumanReadingPrompt(blogger, ctx, knowledge, intention || null);
      }
    }

    if (intention) {
      systemPrompt += intentionReadingPromptBlock(intention);
    }

    const cardsKey = tarotCardsKey(tarotCards);
    let historyId: string | undefined;
    let reading: string;

    if (await ensureDb()) {
      const prior = await getUserReadingHistory(authed.profileUserId);
      const existing = prior.find(
        (r) =>
          r.character_name === characterId &&
          r.context_data?.type === "reading" &&
          typeof r.context_data.reading === "string" &&
          tarotCardsKey(r.context_data.tarotCards as { name: string }[] | undefined) === cardsKey
      );

      if (existing && !forceRegenerate) {
        reading = existing.context_data.reading as string;
        historyId = existing.id;
        isPaid = existing.is_paid || isPaid;

        void patchTripletInterpretation(authed.profileUserId, cardsKey, {
          text: reading,
          masterId: characterId,
        }).catch((err) => console.warn("Triplet interpretation patch failed:", err));

        if (sessionId) {
          try {
            await saveMessage(sessionId, characterId, "assistant", reading, authed.profileUserId);
          } catch (err) {
            console.warn("Reading chat save failed:", err);
          }
        }

        return NextResponse.json({
          reading,
          isPaid,
          historyId,
          reused: true,
          createdAt:
            existing.created_at instanceof Date
              ? existing.created_at.toISOString()
              : String(existing.created_at),
        });
      }
    }

    const runeSettings = await getRuneSettings();
    const useRuneBilling = isRuneBillingActive(authed.profileUserId, unlimited, runeSettings);
    let runeBalance: number | undefined;

    if (useRuneBilling) {
      const spendResult = await spendRunesAtomic(authed.profileUserId, "READING");
      if (!spendResult.success) {
        return insufficientRunesResponse(spendResult.balanceAfter, spendResult.cost);
      }
      runeBalance = spendResult.balanceAfter;
      spentRunes = spendResult.cost;
      isPaid = true;
      if (sessionId) {
        await unlockSingleSession(sessionId);
      }
    }

    const memoryBlock = sessionId
      ? await buildMemoryBlock(authed.profileUserId, characterId, sessionId)
      : "";
    const clientBlock = buildClientBlock({
      name: userName,
      gender,
      zodiac,
      birthDate,
      mainQuestion,
      lifeFocus,
    });
    systemPrompt = appendUserMemoryToPrompt(
      systemPrompt,
      `${clientBlock}${memoryBlock}`.trim() || null
    );

    const deckSystem = resolveMasterDeckSystem(characterId);
    const userForContext = userContextFromProfile({
      name: userName,
      gender,
      birthDate,
      zodiac,
      astroMeta: astroMeta as Record<string, unknown> | undefined,
    });
    const cardsForContext = enrichCardsForSpreadContext(deckSystem, tarotCards);
    const userMessage = buildSpreadUserMessage({
      user: userForContext,
      cards: cardsForContext,
      intention: resolveIntentionLabel(intention || null),
    });

    const generated = await generateReading(systemPrompt, {
      userName,
      tarotCards,
      isPaid,
      characterId,
      intention: intention || null,
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
        },
        isPaid,
      });
      historyId = entry.id;

      void patchTripletInterpretation(authed.profileUserId, cardsKey, {
        text: reading,
        masterId: characterId,
      }).catch((err) => console.warn("Triplet interpretation patch failed:", err));

      if (sessionId) {
        try {
          await saveMessage(sessionId, characterId, "assistant", reading, authed.profileUserId);
        } catch (err) {
          console.warn("Reading chat save failed:", err);
        }
      }
    }

    return NextResponse.json({
      reading,
      isPaid,
      historyId,
      runeBalance,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Reading error:", error);
    if (spentRunes > 0) {
      try {
        await refundRunes(authed.profileUserId, spentRunes, "Возврат: ошибка расшифровки", "READING");
      } catch (refundErr) {
        console.error("Reading refund failed:", refundErr);
      }
    }
    const reading = fallbackReading(characterId, { userName, isPaid, tarotCards });
    return NextResponse.json({ reading, isPaid, fallback: true });
  }
}
