import type { Message } from "@/types";

const DEFAULT_CHUNK = 10;
const DEFAULT_DELAY_MS = 14;

/** Typewriter effect for a pre-built assistant message (client-side). */
export async function streamAssistantMessageText(
  setMessages: (updater: (prev: Message[]) => Message[]) => void,
  replyId: string,
  fullText: string,
  options?: { chunkSize?: number; delayMs?: number }
): Promise<void> {
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;

  for (let i = 0; i < fullText.length; i += chunkSize) {
    const partial = fullText.slice(0, Math.min(i + chunkSize, fullText.length));
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === replyId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx]!, content: partial };
      return next;
    });
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

/** Append suffix only — avoids re-typing the whole message after LLM finale. */
export async function streamAssistantMessageAppend(
  setMessages: (updater: (prev: Message[]) => Message[]) => void,
  replyId: string,
  baseText: string,
  appendText: string,
  options?: { chunkSize?: number; delayMs?: number }
): Promise<void> {
  if (!appendText) return;
  const chunkSize = options?.chunkSize ?? DEFAULT_CHUNK;
  const delayMs = options?.delayMs ?? DEFAULT_DELAY_MS;

  for (let i = 0; i < appendText.length; i += chunkSize) {
    const partialAppend = appendText.slice(0, Math.min(i + chunkSize, appendText.length));
    const content = baseText + partialAppend;
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === replyId);
      if (idx < 0) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx]!, content };
      return next;
    });
    await new Promise((r) => setTimeout(r, delayMs));
  }
}
