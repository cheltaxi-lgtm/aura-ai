import { completeChatDetailed, type ChatMessage } from "@/lib/llm";

const CONTINUE_USER_PROMPT =
  "Текст оборвался на лимите. Продолжи ровно с того места, где остановилась — без повтора уже написанного. Допиши до логического завершения (1–4 предложения). Заверши последнее предложение точкой.";

/** Avoid showing mid-word LLM cutoffs when the provider hits max_tokens. */
export function trimIncompleteTrailingSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  if (/[.!?…»"')\]]$/.test(t)) return t;

  const lastEnd = Math.max(
    t.lastIndexOf(". "),
    t.lastIndexOf("! "),
    t.lastIndexOf("? "),
    t.lastIndexOf("… ")
  );
  if (lastEnd >= Math.floor(t.length * 0.45)) {
    return t.slice(0, lastEnd + 1).trim();
  }
  return t;
}

export function isProseLikelyTruncated(text: string): boolean {
  const t = text.trim();
  if (t.length < 48) return false;
  if (/[.!?…»"')\]]$/.test(t)) return false;
  return true;
}

function normalizeProseChunk(text: string): string {
  return text.trim().replace(/^["«]|["»]$/g, "");
}

/** Complete prose with auto-continuation when the model hits max_tokens. */
export async function completeProseWithContinuation(
  initialMessages: ChatMessage[],
  opts: { maxTokens: number; temperature: number; maxPasses?: number }
): Promise<string | null> {
  const maxPasses = opts.maxPasses ?? 2;
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
