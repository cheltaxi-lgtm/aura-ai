import { MIN_SPREAD_READING_CHARS } from "@/lib/chat-cache";
import { missingCardMentions } from "@/lib/chat-reply-sanitize";

export type SpreadConversationMessage = {
  role: "user" | "assistant";
  content: string;
};

export type SpreadResponseMode = "none" | "opening" | "followup";

/** A persisted assistant reply that already delivered the current spread. */
export function hasCompletedSpreadReply(
  messages: SpreadConversationMessage[],
  cardNames: string[]
): boolean {
  if (!cardNames.length) return false;
  return messages.some((message) => {
    if (message.role !== "assistant") return false;
    const text = message.content.trim();
    if (text.length < MIN_SPREAD_READING_CHARS) return false;
    const mentioned = cardNames.length - missingCardMentions(text, cardNames).length;
    // A teaser or partial-access reply may mention only the first card. It is
    // not a delivered spread and must still open in full after unlock.
    return mentioned === cardNames.length;
  });
}

/** Cards describe the consultation; only an undelivered spread is long-form. */
export function resolveSpreadResponseMode(input: {
  messages: SpreadConversationMessage[];
  cardNames: string[];
  hasCompleteSpread: boolean;
  periodSpread: boolean;
}): SpreadResponseMode {
  if (!input.periodSpread && !input.hasCompleteSpread) return "none";
  return hasCompletedSpreadReply(input.messages, input.cardNames) ? "followup" : "opening";
}
