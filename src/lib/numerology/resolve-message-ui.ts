import type { Message } from "@/types";

import { parseBirthDate } from "./constants";
import { pythagorasSquare, type PythagorasSquareResult } from "./pythagoras-square";
import { detectNumerologyTopics } from "./topic-handlers";

const SPREAD_TOOL_USER_RE =
  /^(?:расч[ёе]т|расклад|сеанс|совместимость|число|прогноз|карма|личный)/i;

/** Resolve Pythagoras grid — only when explicitly attached or user asked for the square. */
export function resolvePythagorasSquareForMessage(
  messages: Message[],
  messageIndex: number,
  birthDate?: string
): PythagorasSquareResult | null {
  const msg = messages[messageIndex];
  if (msg?.numerologyUi?.pythagorasSquare) {
    return msg.numerologyUi.pythagorasSquare;
  }

  // Do not infer from assistant prose — spread readings mention the square as a CTA.
  if (!birthDate || !parseBirthDate(birthDate)) return null;

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
