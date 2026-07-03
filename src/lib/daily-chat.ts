import { generateId } from "@/lib/id";
import type { Message } from "@/types";
import type { SpreadId } from "@/lib/spreads";

export interface DailyReadingChatPayload {
  readingText: string;
  question?: string;
  spreadId: SpreadId;
  cards: { name: string; position?: string }[];
}

const DAILY_MARKER = "[Расклад на сутки]";

export function buildDailyReadingUserMessage(
  question: string,
  cards: DailyReadingChatPayload["cards"]
): string {
  const q = question.trim();
  if (q) return `${DAILY_MARKER} ${q}`;
  const labels = cards.map((c) => c.position ?? c.name).filter(Boolean);
  if (labels.length) {
    return `${DAILY_MARKER} Карты дня: ${labels.join(" · ")}`;
  }
  return `${DAILY_MARKER} Обсудить энергию дня`;
}

export function buildDailyReadingChatMessages(
  readingText: string,
  question: string,
  cards: DailyReadingChatPayload["cards"]
): Message[] {
  const now = new Date();
  return [
    {
      id: generateId(),
      role: "user",
      content: buildDailyReadingUserMessage(question, cards),
      timestamp: now,
    },
    {
      id: generateId(),
      role: "assistant",
      content: readingText.trim(),
      timestamp: new Date(now.getTime() + 1),
    },
  ];
}

export function mergeDailyReadingIntoChat(existing: Message[], dailyMessages: Message[]): Message[] {
  if (!dailyMessages.length) return existing;
  if (existing.some((m) => m.role === "user" && m.content.includes(DAILY_MARKER))) {
    return existing;
  }
  return [...existing, ...dailyMessages];
}
