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

export async function captureRitualMemory(params: {
  captureGeneration: string | null;
  userId: string;
  ritualId: string;
  characterKey: string;
  ritualType: RitualType | string;
  answers: string[];
  assistantSummary?: string | null;
}): Promise<void> {
  const userMessage = buildRitualAnswersMessage(params.ritualType, params.answers);
  if (!userMessage) return;
  await recordTurn({
    captureGeneration: params.captureGeneration,
    userId: params.userId,
    characterId: params.characterKey,
    userMessage,
    assistantReply: (params.assistantSummary ?? "").slice(0, 2000),
    sourceType: "ritual",
    sourceEntityId: params.ritualId,
  }).catch((err) => console.warn("[memory] ritual capture failed:", err));
}

export async function captureRitualReviewMemory(params: {
  captureGeneration: string | null;
  userId: string;
  ritualId: string;
  characterKey: string;
  outcomeText: string;
}): Promise<void> {
  const userMessage = params.outcomeText.trim();
  if (!userMessage) return;
  await recordTurn({
    captureGeneration: params.captureGeneration,
    userId: params.userId,
    characterId: params.characterKey,
    userMessage: `Итог обряда: ${userMessage}`.slice(0, 4000),
    assistantReply: "",
    sourceType: "ritual_review",
    sourceEntityId: params.ritualId,
  }).catch((err) => console.warn("[memory] ritual review capture failed:", err));
}

export async function captureJointInviteMemory(params: {
  captureGeneration: string | null;
  userId: string;
  jointId: string;
  initiatorName?: string | null;
  partnerName?: string | null;
  intentSlug?: string | null;
}): Promise<void> {
  const partner = params.partnerName?.trim();
  const initiator = params.initiatorName?.trim();
  if (!partner && !initiator) return;
  const parts = [
    initiator ? `Клиент: ${initiator}` : null,
    partner ? `Другой участник совместного расклада: ${partner}` : null,
    params.intentSlug ? `Тема: ${params.intentSlug}` : null,
  ].filter(Boolean);
  const userMessage = parts.join(". ");
  if (!userMessage) return;
  await recordTurn({
    captureGeneration: params.captureGeneration,
    userId: params.userId,
    characterId: "joint",
    userMessage,
    assistantReply: "",
    sourceType: "joint",
    sourceEntityId: params.jointId,
  }).catch((err) => console.warn("[memory] joint invite capture failed:", err));
}

export async function captureJointCombinedMemory(params: {
  captureGeneration: string | null;
  partnerCaptureGeneration: string | null;
  initiatorUserId: string;
  partnerUserId?: string | null;
  jointId: string;
  initiatorName?: string | null;
  partnerName?: string | null;
  intentSlug?: string | null;
  combinedReading: string;
}): Promise<void> {
  const userMessage = [
    params.initiatorName?.trim() ? `Клиент: ${params.initiatorName.trim()}` : null,
    params.partnerName?.trim()
      ? `Другой участник совместного расклада: ${params.partnerName.trim()}`
      : null,
    params.intentSlug ? `Совместный расклад: ${params.intentSlug}` : null,
  ]
    .filter(Boolean)
    .join(". ");
  if (!userMessage) return;
  const assistantReply = params.combinedReading.slice(0, 2000);
  await recordTurn({
    captureGeneration: params.captureGeneration,
    userId: params.initiatorUserId,
    characterId: "joint",
    userMessage,
    assistantReply,
    sourceType: "joint_combined",
    sourceEntityId: params.jointId,
  }).catch((err) => console.warn("[memory] joint combined capture failed:", err));

  if (params.partnerUserId && params.partnerUserId !== params.initiatorUserId) {
    await recordTurn({
    captureGeneration: params.partnerCaptureGeneration,
      userId: params.partnerUserId,
      characterId: "joint",
      userMessage: [
        params.partnerName?.trim() ? `Клиент: ${params.partnerName.trim()}` : null,
        params.initiatorName?.trim() ? `Другой участник совместного расклада: ${params.initiatorName.trim()}` : null,
        params.intentSlug ? `Тема совместного расклада: ${params.intentSlug}` : null,
      ].filter(Boolean).join('. '),
      assistantReply,
      sourceType: "joint_combined",
      sourceEntityId: params.jointId,
    }).catch((err) =>
      console.warn("[memory] joint combined partner capture failed:", err)
    );
  }
}
