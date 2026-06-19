import { generateId } from "@/lib/id";
import type { Message } from "@/types";

export function buildPhotoReadingUserMessage(
  question: string,
  detectedCards: string[]
): string {
  const q = question.trim();
  if (q) return `[Фото-расклад] ${q}`;
  if (detectedCards.length) {
    return `[Фото-расклад] Карты на фото: ${detectedCards.join(", ")}`;
  }
  return "[Фото-расклад] Разбор расклада по фото";
}

export function buildPhotoReadingChatMessages(
  analysis: string,
  question: string,
  detectedCards: string[]
): Message[] {
  const now = new Date();
  return [
    {
      id: generateId(),
      role: "user",
      content: buildPhotoReadingUserMessage(question, detectedCards),
      timestamp: now,
    },
    {
      id: generateId(),
      role: "assistant",
      content: analysis.trim(),
      timestamp: new Date(now.getTime() + 1),
    },
  ];
}
