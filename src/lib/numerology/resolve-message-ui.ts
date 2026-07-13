import type { Message } from "@/types";

import { parseBirthDate } from "./constants";
import { pythagorasSquare, type PythagorasSquareResult } from "./pythagoras-square";
import { detectNumerologyTopics } from "./topic-handlers";
import type { NumerologToolId } from "./tools";
import { MIN_SPREAD_READING_CHARS } from "@/lib/chat-cache";

const SPREAD_TOOL_USER_RE =
  /^(?:расч[ёе]т|расклад|сеанс|совместимость|число|прогноз|карма|личный)/i;

function isSpreadReadingMessage(content?: string): boolean {
  return (content?.trim().length ?? 0) >= MIN_SPREAD_READING_CHARS;
}

/** Resolve Pythagoras grid — attached UI, session tool, or explicit user ask. */
export function resolvePythagorasSquareForMessage(
  messages: Message[],
  messageIndex: number,
  birthDate?: string,
  sessionNumerologToolId?: NumerologToolId | null
): PythagorasSquareResult | null {
  const msg = messages[messageIndex];
  if (msg?.numerologyUi?.pythagorasSquare) {
    return msg.numerologyUi.pythagorasSquare;
  }

  if (!birthDate || !parseBirthDate(birthDate)) return null;

  if (sessionNumerologToolId === "pythagoras" && msg?.role === "assistant") {
    const firstReadingIdx = messages.findIndex(
      (m) => m.role === "assistant" && isSpreadReadingMessage(m.content)
    );
    if (messageIndex === firstReadingIdx) {
      return pythagorasSquare(birthDate);
    }
  }

  let userContent = "";
  for (let i = messageIndex - 1; i >= 0; i--) {
    const prior = messages[i];
    if (prior?.role === "user") {
      userContent = prior.content;
      break;
    }
  }
  if (!userContent.trim()) return null;

  const trimmedUser = userContent.trim();
  if (SPREAD_TOOL_USER_RE.test(trimmedUser) && !/квадрат\s+пифагора|психоматриц/i.test(trimmedUser)) {
    return null;
  }

  if (!detectNumerologyTopics(userContent).includes("pythagoras_square")) {
    return null;
  }

  return pythagorasSquare(birthDate);
}

/** Re-attach numerology UI when server history omits client-only fields. */
export function enrichNumerologMessagesOnRestore(
  messages: Message[],
  input: {
    numerologToolId?: NumerologToolId | null;
    birthDate?: string | null;
  }
): Message[] {
  if (!input.birthDate) return messages;
  const firstReadingIdx = messages.findIndex(
    (m) => m.role === "assistant" && isSpreadReadingMessage(m.content)
  );
  if (firstReadingIdx < 0) return messages;

  let toolId = input.numerologToolId;
  if (!toolId) {
    const text = messages[firstReadingIdx]?.content ?? "";
    if (/квадрат\s+пифагора|психоматриц/i.test(text)) {
      toolId = "pythagoras";
    } else if (/матриц[аы]\s+судьб/i.test(text)) {
      toolId = "destiny_matrix";
    }
  }
  if (!toolId) return messages;

  if (toolId === "pythagoras") {
    const square = pythagorasSquare(input.birthDate);
    if (!square) return messages;
    return messages.map((m, i) =>
      i === firstReadingIdx && m.role === "assistant" && !m.numerologyUi?.pythagorasSquare
        ? { ...m, numerologyUi: { pythagorasSquare: square } }
        : m
    );
  }

  return messages;
}
