import type { Message } from "@/types";

function contentKey(content: string): string {
  return content.trim().slice(0, 240);
}

/** Attach numerology UI to the latest assistant message (client-side only). */
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

/** Preserve client-only fields when server history reloads (ids differ from client temp ids). */
export function mergeChatMessageMetadata(
  prev: Message[],
  incoming: Message[]
): Message[] {
  const prevById = new Map(prev.map((m) => [m.id, m]));
  const uiByContent = new Map<string, NonNullable<Message["numerologyUi"]>>();

  for (const m of prev) {
    if (m.role === "assistant" && m.numerologyUi) {
      const key = contentKey(m.content);
      if (key) uiByContent.set(key, m.numerologyUi);
    }
  }

  let merged = incoming.map((m) => {
    const kept = prevById.get(m.id);
    if (kept?.numerologyUi && !m.numerologyUi) {
      return { ...m, numerologyUi: kept.numerologyUi };
    }
    if (m.role === "assistant" && !m.numerologyUi) {
      const ui = uiByContent.get(contentKey(m.content));
      if (ui) return { ...m, numerologyUi: ui };
    }
    return m;
  });

  const prevLastUser = [...prev].reverse().find((m) => m.role === "user");
  const incomingLastUser = [...merged].reverse().find((m) => m.role === "user");
  const prevLastAssistant = [...prev].reverse().find((m) => m.role === "assistant");

  if (
    prevLastAssistant?.numerologyUi &&
    prevLastUser?.content === incomingLastUser?.content
  ) {
    let lastAssistantIdx = -1;
    for (let i = merged.length - 1; i >= 0; i--) {
      if (merged[i]?.role === "assistant") {
        lastAssistantIdx = i;
        break;
      }
    }
    if (lastAssistantIdx >= 0 && !merged[lastAssistantIdx]?.numerologyUi) {
      merged = merged.map((m, i) =>
        i === lastAssistantIdx
          ? { ...m, numerologyUi: prevLastAssistant.numerologyUi }
          : m
      );
    }
  }

  return merged;
}
