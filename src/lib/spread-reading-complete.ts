import { sanitizeReadingForClient } from "@/lib/chat-reply-sanitize";
import type { ChatMessage } from "@/lib/llm";
import { continueAssistantProse } from "@/lib/prose-completion";
import { isProseLikelyTruncated } from "@/lib/prose-truncation";

/** Paid spread must end cleanly and pass reading sanitizer (full card coverage). */
export function isPaidSpreadTextComplete(text: string, cardNames: string[]): boolean {
  const trimmed = text.trim();
  if (!trimmed || isProseLikelyTruncated(trimmed)) return false;
  return Boolean(sanitizeReadingForClient(trimmed, cardNames));
}

/** Continue generation until every card is mentioned or attempts are exhausted. */
export async function ensurePaidSpreadTextComplete(
  contextMessages: ChatMessage[],
  text: string | null | undefined,
  cardNames: string[],
  opts: { maxTokens: number; temperature: number; maxRounds?: number }
): Promise<string | null> {
  let current = typeof text === "string" ? text.trim() : "";
  if (!current) return null;

  const maxRounds = opts.maxRounds ?? 4;
  for (let round = 0; round < maxRounds; round++) {
    if (isPaidSpreadTextComplete(current, cardNames)) return current;

    const continued = await continueAssistantProse(contextMessages, current, {
      maxTokens: Math.max(opts.maxTokens, 2200) + round * 600,
      temperature: opts.temperature,
      maxPasses: 2,
      cardNames,
    });
    if (!continued?.trim() || continued.trim().length <= current.length) break;
    current = continued.trim();
  }

  return isPaidSpreadTextComplete(current, cardNames) ? current : null;
}
