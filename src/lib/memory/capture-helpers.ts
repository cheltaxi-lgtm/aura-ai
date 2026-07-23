/**
 * Small helpers to enqueue durable memory extraction from product flows
 * that are not ordinary chat turns.
 */
import { recordTurn } from "@/lib/memory/client-memory";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";

export function buildRitualAnswersMessage(
  ritualType: RitualType | string,
  answers: string[]
): string {
  const questions =
    ritualType in RITUAL_TYPES
      ? RITUAL_TYPES[ritualType as RitualType].questions
      : [];
  const lines = answers
    .map((a, i) => {
      const q = questions[i]?.trim();
      const answer = String(a ?? "").trim();
      if (!answer) return null;
      return q ? `${q} — ${answer}` : answer;
    })
    .filter(Boolean);
  return lines.join("\n").slice(0, 4000);
}

export function captureRitualMemory(params: {
  userId: string;
  ritualId: string;
  characterKey: string;
  ritualType: RitualType | string;
  answers: string[];
  assistantSummary?: string | null;
}): void {
  const userMessage = buildRitualAnswersMessage(params.ritualType, params.answers);
  if (userMessage.length < 8) return;
  void recordTurn({
    userId: params.userId,
    characterId: params.characterKey,
    userMessage,
    assistantReply: (params.assistantSummary ?? "").slice(0, 2000),
    sourceType: "ritual",
    sourceEntityId: params.ritualId,
  }).catch((err) => console.warn("[memory] ritual capture failed:", err));
}

export function captureRitualReviewMemory(params: {
  userId: string;
  ritualId: string;
  characterKey: string;
  outcomeText: string;
}): void {
  const userMessage = params.outcomeText.trim();
  if (userMessage.length < 8) return;
  void recordTurn({
    userId: params.userId,
    characterId: params.characterKey,
    userMessage: `Итог обряда: ${userMessage}`.slice(0, 4000),
    assistantReply: "",
    sourceType: "ritual_review",
    sourceEntityId: params.ritualId,
  }).catch((err) => console.warn("[memory] ritual review capture failed:", err));
}

export function captureJointInviteMemory(params: {
  userId: string;
  jointId: string;
  initiatorName?: string | null;
  partnerName?: string | null;
  intentSlug?: string | null;
}): void {
  const partner = params.partnerName?.trim();
  const initiator = params.initiatorName?.trim();
  if (!partner && !initiator) return;
  const parts = [
    initiator ? `Клиент: ${initiator}` : null,
    partner ? `Партнёр для совместного расклада: ${partner}` : null,
    params.intentSlug ? `Тема: ${params.intentSlug}` : null,
  ].filter(Boolean);
  const userMessage = parts.join(". ");
  if (userMessage.length < 8) return;
  void recordTurn({
    userId: params.userId,
    characterId: "joint",
    userMessage,
    assistantReply: "",
    sourceType: "joint",
    sourceEntityId: params.jointId,
  }).catch((err) => console.warn("[memory] joint invite capture failed:", err));
}

export function captureJointCombinedMemory(params: {
  initiatorUserId: string;
  partnerUserId?: string | null;
  jointId: string;
  initiatorName?: string | null;
  partnerName?: string | null;
  intentSlug?: string | null;
  combinedReading: string;
}): void {
  const userMessage = [
    params.initiatorName?.trim() ? `Клиент: ${params.initiatorName.trim()}` : null,
    params.partnerName?.trim()
      ? `Партнёр: ${params.partnerName.trim()}`
      : null,
    params.intentSlug ? `Совместный расклад: ${params.intentSlug}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  if (userMessage.length < 8) return;
  const assistantReply = params.combinedReading.slice(0, 2000);
  void recordTurn({
    userId: params.initiatorUserId,
    characterId: "joint",
    userMessage,
    assistantReply,
    sourceType: "joint_combined",
    sourceEntityId: params.jointId,
  }).catch((err) => console.warn("[memory] joint combined capture failed:", err));

  if (params.partnerUserId && params.partnerUserId !== params.initiatorUserId) {
    void recordTurn({
      userId: params.partnerUserId,
      characterId: "joint",
      userMessage,
      assistantReply,
      sourceType: "joint_combined",
      sourceEntityId: params.jointId,
    }).catch((err) =>
      console.warn("[memory] joint combined partner capture failed:", err)
    );
  }
}
