import { ensureDb } from "@/lib/db";
import { buildPhotoReadingUserMessage } from "@/lib/photo-chat";
import { createHistoryEntry } from "@/lib/users";
import { saveMessage, updateSessionChatMeta } from "@/lib/session";
import { ensureSessionMemoryStub } from "@/lib/session-memory";
import { limitSpreadKeyCards } from "@/lib/spreads";
import { recordTurn } from "@/lib/memory/client-memory";
import {
  redrawSpreadToTarotCards,
  type RedrawSpread,
} from "@/lib/photo-spread-redraw";

export async function persistPhotoReadingResult(params: {
  profileUserId: string;
  characterId: string;
  analysisBody: string;
  detectedCards: string[];
  confirmedSpread: RedrawSpread;
  question: string;
  userName: string;
  resolvedSessionId?: string;
  isPaid: boolean;
  spentRunes: number;
  photoSpreadKey: string;
  idempotencyKey?: string;
  firstPhotoDiscount: boolean;
}): Promise<string | undefined> {
  const tarotCards = redrawSpreadToTarotCards(params.confirmedSpread);
  let historyId: string | undefined;

  if (await ensureDb()) {
    const entry = await createHistoryEntry({
      userId: params.profileUserId,
      characterName: params.characterId,
      contextData: {
        type: "photo_reading",
        analysis: params.analysisBody,
        detectedCards: params.detectedCards,
        deckType: params.confirmedSpread.deckType,
        spreadType: params.confirmedSpread.spreadType,
        deckSystem: params.confirmedSpread.system,
        tarotCards,
        redrawSpread: params.confirmedSpread,
        question: params.question.trim() || undefined,
        userName: params.userName,
        sessionId: params.resolvedSessionId,
        photoSpreadKey: params.photoSpreadKey,
        idempotencyKey: params.idempotencyKey,
        firstPhotoDiscount: params.firstPhotoDiscount,
      },
      isPaid: params.isPaid || params.spentRunes > 0,
    });
    historyId = entry?.id;
  }

  if (params.resolvedSessionId && (await ensureDb())) {
    try {
      const userMsg = buildPhotoReadingUserMessage(params.question, params.detectedCards);
      await saveMessage(
        params.resolvedSessionId,
        params.characterId,
        "user",
        userMsg,
        params.profileUserId
      );
      await saveMessage(
        params.resolvedSessionId,
        params.characterId,
        "assistant",
        params.analysisBody,
        params.profileUserId
      );
      await updateSessionChatMeta(params.resolvedSessionId, {
        characterKey: params.characterId,
        spreadType: "photo",
        cards: params.detectedCards,
      });
      const topicSummary = params.question.trim()
        ? `Фото-расклад: ${params.question.trim().slice(0, 120)}`
        : "Фото-расклад";
      await ensureSessionMemoryStub({
        userId: params.profileUserId,
        sessionId: params.resolvedSessionId,
        characterKey: params.characterId,
        topicSummary,
        keyCards: limitSpreadKeyCards(params.detectedCards),
        prediction: params.analysisBody.slice(0, 500),
      });
    } catch (err) {
      console.warn("Photo reading chat save failed:", err);
    }
  }

  if (params.question.trim()) {
    void recordTurn({
      userId: params.profileUserId,
      characterId: params.characterId,
      userMessage: params.question,
      assistantReply: params.analysisBody,
      sourceType: "photo",
      sourceEntityId: historyId ?? params.resolvedSessionId ?? null,
    }).catch((err) => console.warn("[memory] photo recordTurn failed:", err));
  }

  return historyId;
}

export function photoReadingJsonFromContext(
  ctx: Record<string, unknown>,
  extras: {
    historyId?: string;
    runeBalance?: number;
    cached?: boolean;
    firstPhotoDiscount?: boolean;
  }
) {
  return {
    analysis: ctx.analysis,
    detectedCards: ctx.detectedCards,
    deckType: ctx.deckType,
    spreadType: ctx.spreadType,
    deckSystem: ctx.deckSystem,
    redrawSpread: ctx.redrawSpread,
    tarotCards: ctx.tarotCards,
    characterId: ctx.characterName ?? ctx.characterId,
    isPaid: true,
    saved: true,
    historyId: extras.historyId,
    sessionId: ctx.sessionId,
    runeBalance: extras.runeBalance,
    cached: extras.cached ?? false,
    firstPhotoDiscount: extras.firstPhotoDiscount ?? ctx.firstPhotoDiscount === true,
  };
}
