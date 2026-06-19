import { NextRequest, NextResponse } from "next/server";

import { ensureDb } from "@/lib/db";
import { withTransaction } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import {
  getSession,
  saveMessage,
  hasPaidAccess,
  reserveQuestionSlot,
  decrementQuestionCount,
  incrementQuestionCount,
  getFreeQuestionLimit,
  getBloggerBySlug,
  getBloggerKnowledge,
} from "@/lib/session";
import { buildChatPrompt, buildHumanChatPrompt, generateChatReply, llmUnavailableReply } from "@/lib/chat-prompts";
import { isAiMasterId } from "@/lib/showcase-masters";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import {
  appendUserMemoryToPrompt,
  buildUserMemoryBlock,
  cardsKeyFromTarot,
} from "@/lib/user-memory";
import {
  countSessionMemories,
  getSessionMemories,
  maybePersistSessionMemory,
} from "@/lib/session-memory";
import { canAfford, spendRunes, refundRunes } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { resolveSessionForUser } from "@/lib/session-access";
import {
  enforceChatRateLimit,
  validateLastUserMessage,
  validateImageBase64Payload,
  MAX_IMAGE_BYTES,
} from "@/lib/api-guards";
import {
  resolveApiCharacterId,
  sanitizeChatHistory,
  sanitizeUserProfileForPrompt,
} from "@/lib/chat-sanitize";
import type { RuneActionType } from "@/lib/rune-costs";

export async function POST(request: NextRequest) {
  let spentRunes = 0;
  let spentAction: RuneActionType | undefined;
  let profileUserId: string | null = null;
  let sessionIdForRollback: string | undefined;
  let slotReserved = false;
  let sessionHasFullAccess = false;

  try {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "Требуется регистрация", code: "auth_required" }, { status: 401 });
    }

    const rateLimited = await enforceChatRateLimit(auth.sub);
    if (rateLimited) return rateLimited;

    const body = await request.json();

    const {
      characterId: rawCharacterId,
      messages: rawMessages,
      imageBase64,
      sessionId,
      userProfile: rawUserProfile,
      tarotCards,
    } = body as {
      characterId: string;
      messages: { role: string; content: string }[];
      imageBase64?: string;
      sessionId?: string;
      userProfile?: {
        name: string;
        gender: string;
        zodiac: string;
        birthDate: string;
        birthTime?: string;
        birthCity?: string;
        lifeFocus?: string;
        mainQuestion?: string;
        astroMeta?: import("@/lib/astro-profile").AstroMeta;
      };
      tarotCards?: { name: string; meaning: string }[];
    };

    const characterId = await resolveApiCharacterId(rawCharacterId);
    const messages = sanitizeChatHistory(rawMessages ?? []);
    const userProfile = sanitizeUserProfileForPrompt(rawUserProfile);

    if (!messages.length) {
      return NextResponse.json({ error: "messages required" }, { status: 400 });
    }

    const msgError = validateLastUserMessage(messages);
    if (msgError) return msgError;

    if (imageBase64) {
      const rawSize = Math.ceil((imageBase64.length * 3) / 4);
      if (rawSize > MAX_IMAGE_BYTES) {
        return NextResponse.json({ error: "Фото слишком большое (макс. 5 МБ)" }, { status: 400 });
      }
      const imageErr = validateImageBase64Payload(imageBase64);
      if (imageErr) return imageErr;
    }

    const dbOk = await ensureDb();
    profileUserId = await getProfileUserIdForAccount(auth.sub);

    const unlimited = await resolveUnlimitedAccess({
      accountId: auth.sub,
      profileUserId: profileUserId ?? undefined,
    });

    const runeSettings = await getRuneSettings();
    const freeLimit = await getFreeQuestionLimit();

    let session = sessionId && dbOk ? await getSession(sessionId) : null;
    let isPaid = false;

    if (session) {
      isPaid = hasPaidAccess(session, { unlimited });
    } else if (unlimited) {
      isPaid = true;
    }

    const useRuneBilling = Boolean(profileUserId && !unlimited && !isPaid && runeSettings.enabled);
    const needsSession = Boolean(
      dbOk && !unlimited && !isPaid && (useRuneBilling || !runeSettings.enabled)
    );

    if (needsSession) {
      const resolved = await resolveSessionForUser(sessionId, profileUserId);
      if (resolved.error) return resolved.error;
      session = resolved.session;
      sessionIdForRollback = session!.id;
      isPaid = hasPaidAccess(session!, { unlimited });
    }

    sessionHasFullAccess = isPaid || unlimited;

    let runeBalance: number | undefined;
    let questionIndex = session ? Math.max(0, session.free_questions_used) : 0;

    if (dbOk && session && !sessionHasFullAccess && useRuneBilling && profileUserId) {
      const actionType: RuneActionType = imageBase64 ? "VISION_ANALYSIS" : "QUESTION";

      try {
        await withTransaction(async (client) => {
          const reserved = await reserveQuestionSlot(session!.id, freeLimit, false, client);
          if (reserved === null) {
            const newCount = await incrementQuestionCount(session!.id, client);
            slotReserved = true;
            questionIndex = newCount - 1;
          } else {
            slotReserved = true;
            questionIndex = reserved - 1;
          }

          const affordCheck = await canAfford(profileUserId!, actionType, questionIndex);
          if (!affordCheck.allowed) {
            const err = new Error("INSUFFICIENT_RUNES") as Error & {
              code: string;
              balance: number;
              required: number;
              reason?: string;
            };
            err.code = "INSUFFICIENT_RUNES";
            err.balance = affordCheck.balance;
            err.required = affordCheck.cost;
            err.reason = affordCheck.reason;
            throw err;
          }

          const spendResult = await spendRunes(profileUserId!, actionType, questionIndex, client);
          if (!spendResult.success) {
            const err = new Error("INSUFFICIENT_RUNES") as Error & {
              code: string;
              balance: number;
              required: number;
            };
            err.code = "INSUFFICIENT_RUNES";
            err.balance = affordCheck.balance;
            err.required = affordCheck.cost;
            throw err;
          }

          spentRunes = spendResult.cost ?? affordCheck.cost;
          spentAction = actionType;
          runeBalance = spendResult.newBalance;
        });
        session = (await getSession(session.id)) ?? session;
      } catch (billingErr) {
        const err = billingErr as Error & {
          code?: string;
          balance?: number;
          required?: number;
          reason?: string;
        };
        if (err.code === "INSUFFICIENT_RUNES") {
          return NextResponse.json(
            {
              error: "INSUFFICIENT_RUNES",
              balance: err.balance ?? 0,
              required: err.required ?? 0,
              message: err.reason,
            },
            { status: 402 }
          );
        }
        throw billingErr;
      }
    } else if (dbOk && session && !sessionHasFullAccess) {
      const reserved = await reserveQuestionSlot(session.id, freeLimit, false);
      if (reserved === null) {
        return NextResponse.json({ error: "paywall", paywall: true }, { status: 402 });
      }
      slotReserved = true;
      questionIndex = reserved - 1;
      session = (await getSession(session.id)) ?? session;
    } else if (dbOk && session && sessionHasFullAccess) {
      await reserveQuestionSlot(session.id, freeLimit, true);
    }

    if (dbOk && session) {
      const lastUser = messages[messages.length - 1];
      if (lastUser?.role === "user") {
        try {
          await saveMessage(session.id, characterId, "user", lastUser.content);
        } catch (dbErr) {
          console.warn("Chat DB write failed:", dbErr);
        }
      }
    }

    const today = new Date().toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });

    const chatCtx = {
      userName: userProfile?.name,
      gender: userProfile?.gender,
      zodiac: userProfile?.zodiac,
      birthDate: userProfile?.birthDate,
      birthTime: userProfile?.birthTime,
      birthCity: userProfile?.birthCity,
      lifeFocus: userProfile?.lifeFocus,
      mainQuestion: userProfile?.mainQuestion,
      astroMeta: userProfile?.astroMeta,
      today,
      tarotCards,
      isPaid: sessionHasFullAccess,
    };

    const usePremiumModel =
      sessionHasFullAccess || (useRuneBilling && questionIndex >= freeLimit);

    const lastUserMsg = messages[messages.length - 1]?.content ?? "";
    let sessionMemories: Awaited<ReturnType<typeof getSessionMemories>> = [];
    let sessionNumber = 1;

    if (profileUserId && dbOk) {
      try {
        sessionMemories = await getSessionMemories(profileUserId, characterId, 3);
        sessionNumber = sessionMemories.length
          ? sessionMemories.length + 1
          : (await countSessionMemories(profileUserId, characterId)) + 1;
      } catch (memErr) {
        console.warn("Session memories load failed:", memErr);
      }
    }

    let systemPrompt = buildChatPrompt(characterId, chatCtx, {
      sessionNumber,
      memory: sessionMemories,
      lastUserMessage: lastUserMsg,
    });

    if (dbOk) {
      const humanSlug = !isAiMasterId(characterId) ? characterId : session?.referrer_slug;

      if (humanSlug) {
        const blogger = await getBloggerBySlug(humanSlug);
        if (blogger) {
          const knowledge = await getBloggerKnowledge(blogger.id);
          if (!isAiMasterId(characterId)) {
            systemPrompt = buildHumanChatPrompt(blogger, chatCtx, knowledge);
          } else {
            systemPrompt += `\n\nСтиль мастера ${blogger.display_name}: ${blogger.style_notes ?? ""}\nБаза знаний:\n${knowledge}`;
          }
        }
      }
    }

    if (!sessionHasFullAccess && userProfile && tarotCards?.length) {
      systemPrompt +=
        "\n\nНапоминание: при частичном доступе — 2-я и 3-я карты только крючком.";
    }

    if (profileUserId) {
      const memoryBlock = await buildUserMemoryBlock(profileUserId, {
        currentCharacterId: characterId,
        currentCardsKey: cardsKeyFromTarot(tarotCards),
      });
      systemPrompt = appendUserMemoryToPrompt(systemPrompt, memoryBlock);
    }

    const llmReply = await generateChatReply(
      systemPrompt,
      messages,
      imageBase64,
      usePremiumModel
    );
    const llmFailed = !llmReply;
    let runesRefunded = false;

    if (llmFailed && profileUserId && spentRunes > 0) {
      try {
        await refundRunes(
          profileUserId,
          spentRunes,
          "Возврат: пустой ответ LLM",
          spentAction
        );
        spentRunes = 0;
        runesRefunded = true;
      } catch (refundErr) {
        console.error("LLM fallback refund failed:", refundErr);
      }
    }

    if (llmFailed && slotReserved && sessionIdForRollback && dbOk) {
      try {
        await decrementQuestionCount(sessionIdForRollback);
        slotReserved = false;
      } catch (rollbackErr) {
        console.error("LLM fallback slot rollback failed:", rollbackErr);
      }
    }

    const reply = llmReply ?? llmUnavailableReply({ runesRefunded });

    if (dbOk && session) {
      try {
        await saveMessage(session.id, characterId, "assistant", reply);
      } catch (dbErr) {
        console.warn("Chat assistant save failed:", dbErr);
      }
    }

    if (profileUserId && !llmFailed) {
      void maybePersistSessionMemory({
        userId: profileUserId,
        characterKey: characterId,
        messages,
        cardNames: tarotCards?.map((c) => c.name) ?? [],
        lastAssistantReply: reply,
      }).catch((err) => console.warn("Session memory save failed:", err));
    }

    return NextResponse.json({
      reply,
      llmFailed,
      characterId,
      isPaid: sessionHasFullAccess,
      runeBalance,
    });
  } catch (error) {
    console.error("Chat API error:", error);

    if (profileUserId && spentRunes > 0) {
      try {
        await refundRunes(
          profileUserId,
          spentRunes,
          "Возврат: ошибка генерации ответа",
          spentAction
        );
      } catch (refundErr) {
        console.error("Rune refund failed:", refundErr);
      }
    }

    if (slotReserved && sessionIdForRollback) {
      try {
        await decrementQuestionCount(sessionIdForRollback);
      } catch {
        /* ignore */
      }
    }

    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
