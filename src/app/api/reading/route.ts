import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { hasPaidAccess, saveMessage, unlockSingleSession } from "@/lib/session";
import { buildCharacterPrompt, buildHumanReadingPrompt, generateReading, fallbackReading } from "@/lib/chat-prompts";
import { isAiMasterId } from "@/lib/showcase-masters";
import { getBloggerBySlug, getBloggerKnowledge } from "@/lib/session";
import { requireProfileUserId } from "@/lib/require-auth";
import { resolveUnlimitedAccess } from "@/lib/accounts";
import { canAfford, spendRunes, refundRunes } from "@/lib/rune-service";
import { getRuneSettings, runeCostFromSettings } from "@/lib/rune-settings";
import { resolveSessionForUser } from "@/lib/session-access";
import { enforceChatRateLimit } from "@/lib/api-guards";
import { createHistoryEntry, patchTripletInterpretation } from "@/lib/users";
import { getUserReadingHistory } from "@/lib/accounts";
import { tarotCardsKey } from "@/lib/tarot";
import {
  appendUserMemoryToPrompt,
  buildUserMemoryBlock,
  cardsKeyFromTarot,
} from "@/lib/user-memory";
import { getSessionMemories, countSessionMemories } from "@/lib/session-memory";
import { resolveApiCharacterId, sanitizeTextField } from "@/lib/chat-sanitize";

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
  } catch (error) {
    console.error("Reading JSON error:", error);
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!characterId || !userName || !tarotCards?.length) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const authed = await requireProfileUserId();
  if (!authed) {
    return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
  }

  const rateLimited = await enforceChatRateLimit(authed.auth.sub);
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
    });

    if (!isAiMasterId(characterId) && (await ensureDb())) {
      const blogger = await getBloggerBySlug(characterId);
      if (blogger) {
        const knowledge = await getBloggerKnowledge(blogger.id);
        systemPrompt = buildHumanReadingPrompt(blogger, ctx, knowledge);
      }
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

      if (existing) {
        reading = existing.context_data.reading as string;
        historyId = existing.id;
        isPaid = existing.is_paid || isPaid;

        void patchTripletInterpretation(authed.profileUserId, cardsKey, {
          text: reading,
          masterId: characterId,
        }).catch((err) => console.warn("Triplet interpretation patch failed:", err));

        if (sessionId) {
          try {
            await saveMessage(sessionId, characterId, "assistant", reading);
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
    let runeBalance: number | undefined;

    if (runeSettings.enabled && !unlimited && !isPaid) {
      const affordCheck = await canAfford(authed.profileUserId, "READING");
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
      const spendResult = await spendRunes(authed.profileUserId, "READING");
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
      spentRunes = runeCostFromSettings(runeSettings, "READING");
      isPaid = true;
      if (sessionId) {
        await unlockSingleSession(sessionId);
      }
    }

    const memoryBlock = await buildUserMemoryBlock(authed.profileUserId, {
      currentCharacterId: characterId,
      currentCardsKey: cardsKeyFromTarot(tarotCards),
    });
    systemPrompt = appendUserMemoryToPrompt(systemPrompt, memoryBlock);

    const generated = await generateReading(systemPrompt, {
      userName,
      tarotCards,
      isPaid,
      characterId,
    });
    reading = generated.text;

    if (!generated.fromLlm && spentRunes > 0) {
      try {
        await refundRunes(authed.profileUserId, spentRunes, "Возврат: пустой ответ LLM", "READING");
        spentRunes = 0;
        isPaid = false;
      } catch (refundErr) {
        console.error("Reading LLM fallback refund failed:", refundErr);
      }
    }

    if (await ensureDb()) {
      const entry = await createHistoryEntry({
        userId: authed.profileUserId,
        characterName: characterId,
        contextData: {
          type: "reading",
          reading,
          tarotCards,
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
          await saveMessage(sessionId, characterId, "assistant", reading);
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
