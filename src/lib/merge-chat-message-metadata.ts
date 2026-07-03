import type { Message } from "@/types";

/** Preserve client-only fields when server history reloads (ids differ from client temp ids). */
export function mergeChatMessageMetadata(
  prev: Message[],
  incoming: Message[]
): Message[] {
  const prevById = new Map(prev.map((m) => [m.id, m]));

  return incoming.map((m) => {
    const kept = prevById.get(m.id);
    if (kept?.numerologyUi && !m.numerologyUi) {
      return { ...m, numerologyUi: kept.numerologyUi };
    }
    return m;
  });
}

/** @deprecated use mergeChatMessageMetadata */
export function applyNumerologyUiToLastAssistant(
  messages: Message[],
  numerologyUi: NonNullable<Message["numerologyUi"]>
): Message[] {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m?.role === "assistant") {
      const updated = [...messages];
      updated[i] = { ...m, numerologyUi };
      return updated;
    }
  }
  return messages;
}
