import { completeChatDetailed, type ChatMessage } from "@/lib/llm";
import {
  isProseLikelyTruncated,
  trimIncompleteTrailingSentence,
} from "@/lib/prose-truncation";

export { isProseLikelyTruncated, trimIncompleteTrailingSentence } from "@/lib/prose-truncation";

const CONTINUE_USER_PROMPT =
  "Текст оборвался на лимите. Продолжи ровно с того места, где остановилась — без повтора уже написанного. Допиши до логического завершения (1–4 предложения). Заверши последнее предложение точкой.";

export { CONTINUE_USER_PROMPT };

function normalizeProseChunk(text: string): string {
  return text.trim().replace(/^["«]|["»]$/g, "");
}

/** Complete prose with auto-continuation when the model hits max_tokens. */
export async function completeProseWithContinuation(
  initialMessages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; maxPasses?: number }
): Promise<string | null> {
  const maxPasses = opts.maxPasses ?? 3;
  const messages: ChatMessage[] = [...initialMessages];
  let combined = "";

  for (let pass = 0; pass <= maxPasses; pass++) {
    const result = await completeChatDetailed({
      messages,
      maxTokens: opts.maxTokens + pass * 400,
      temperature: opts.temperature,
    });

    const chunk = normalizeProseChunk(result.text ?? "");
    if (!chunk) break;

    combined = combined ? `${combined}${chunk}` : chunk;

    const needsMore =
      result.finishReason === "length" || isProseLikelyTruncated(combined);
    if (!needsMore) {
      return combined;
    }
    if (pass >= maxPasses) break;

    messages.push({ role: "assistant", content: combined });
    messages.push({ role: "user", content: CONTINUE_USER_PROMPT });
  }

  return combined ? trimIncompleteTrailingSentence(combined) : null;
}

/** Continue an assistant reply that hit max_tokens (chat spread / reading). */
export async function continueAssistantProse(
  contextMessages: ChatMessage[],
  partialAssistant: string,
  opts: { maxTokens: number; temperature: number; maxPasses?: number }
): Promise<string | null> {
  const partial = partialAssistant.trim();
  if (!partial) return null;

  const messages: ChatMessage[] = [
    ...contextMessages,
    { role: "assistant", content: partial },
    { role: "user", content: CONTINUE_USER_PROMPT },
  ];

  const continued = await completeProseWithContinuation(messages, {
    maxTokens: opts.maxTokens,
    temperature: opts.temperature,
    maxPasses: opts.maxPasses ?? 1,
  });
  if (!continued?.trim()) return trimIncompleteTrailingSentence(partial);

  if (continued.startsWith(partial)) return continued.trim();
  return `${partial} ${continued.trim()}`;
}
