import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import {
  isProseLikelyTruncated,
  trimIncompleteTrailingSentence,
} from "@/lib/prose-truncation";
import { missingCardMentions } from "@/lib/chat-reply-sanitize";

export { isProseLikelyTruncated, trimIncompleteTrailingSentence } from "@/lib/prose-truncation";

const CONTINUE_USER_PROMPT =
  "Текст оборвался на лимите. Продолжи ровно с того места, где остановилась — без повтора уже написанного. Допиши до логического завершения (1–4 предложения). Заверши последнее предложение точкой.";

export { CONTINUE_USER_PROMPT };

export function buildSpreadContinuePrompt(partial: string, cardNames?: string[]): string {
  const missing = cardNames?.length ? missingCardMentions(partial, cardNames) : [];
  if (missing.length > 0) {
    const list = missing.map((n) => `«${n}»`).join(", ");
    return (
      `Текст расклада неполон: ещё не раскрыты символы ${list}. ` +
      `Продолжи ровно с того места, где остановилась — без повтора уже написанного. ` +
      `Отдельным абзацем раскрой КАЖДЫЙ недостающий символ по имени (значение + вывод). ` +
      `В конце — общий итог по всему раскладу. Заверши последним предложением с точкой.`
    );
  }
  return CONTINUE_USER_PROMPT;
}

function normalizeProseChunk(text: string): string {
  return text.trim().replace(/^["«]|["»]$/g, "");
}

export type ProseContinuationOpts = {
  maxTokens: number;
  temperature: number;
  maxPasses?: number;
  /** When set, continue prompts ask to decode remaining named cards. */
  cardNames?: string[];
  /** Prefer admin paidModel when continuing paid readings. */
  isPaid?: boolean;
};

/** Complete prose with auto-continuation when the model hits max_tokens. */
export async function completeProseWithContinuation(
  initialMessages: ChatMessage[],
  opts: ProseContinuationOpts
): Promise<string | null> {
  const maxPasses = opts.maxPasses ?? 3;
  const messages: ChatMessage[] = [...initialMessages];
  let combined = "";

  for (let pass = 0; pass <= maxPasses; pass++) {
    const result = await completeChatDetailed({
      messages,
      maxTokens: opts.maxTokens + pass * 400,
      temperature: opts.temperature,
      isPaid: opts.isPaid,
      skipTemperatureRetry: true,
    });

    const chunk = normalizeProseChunk(result.text ?? "");
    if (!chunk) break;

    combined = combined ? `${combined}${chunk}` : chunk;

    const missingCards = opts.cardNames?.length
      ? missingCardMentions(combined, opts.cardNames)
      : [];
    const needsMore =
      result.finishReason === "length" ||
      isProseLikelyTruncated(combined) ||
      missingCards.length > 0;
    if (!needsMore) {
      return combined;
    }
    if (pass >= maxPasses) break;

    messages.push({ role: "assistant", content: combined });
    messages.push({
      role: "user",
      content: buildSpreadContinuePrompt(combined, opts.cardNames),
    });
  }

  return combined ? trimIncompleteTrailingSentence(combined) : null;
}

/** Continue an assistant reply that hit max_tokens (chat spread / reading). */
export async function continueAssistantProse(
  contextMessages: ChatMessage[],
  partialAssistant: string,
  opts: ProseContinuationOpts
): Promise<string | null> {
  const partial = partialAssistant.trim();
  if (!partial) return null;

  const messages: ChatMessage[] = [
    ...contextMessages,
    { role: "assistant", content: partial },
    { role: "user", content: buildSpreadContinuePrompt(partial, opts.cardNames) },
  ];

  const continued = await completeProseWithContinuation(messages, {
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    maxPasses: opts.maxPasses ?? 1,
    cardNames: opts.cardNames,
    isPaid: opts.isPaid,
  });
  if (!continued?.trim()) return trimIncompleteTrailingSentence(partial);

  if (continued.startsWith(partial)) return continued.trim();
  return `${partial} ${continued.trim()}`;
}
