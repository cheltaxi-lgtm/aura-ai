import type { Message } from "@/types";

import { parseBirthDate } from "./constants";
import { pythagorasSquare, type PythagorasSquareResult } from "./pythagoras-square";
import { detectNumerologyTopics } from "./topic-handlers";

/** Resolve Pythagoras grid for an assistant message (stored UI or recompute from user topic). */
export function resolvePythagorasSquareForMessage(
  messages: Message[],
  messageIndex: number,
  birthDate?: string
): PythagorasSquareResult | null {
  const msg = messages[messageIndex];
  if (msg?.numerologyUi?.pythagorasSquare) {
    return msg.numerologyUi.pythagorasSquare;
  }

  if (!birthDate || !parseBirthDate(birthDate)) return null;

  let userContent = "";
  for (let i = messageIndex - 1; i >= 0; i--) {
    const prior = messages[i];
    if (prior?.role === "user") {
      userContent = prior.content;
      break;
    }
  }
  if (!userContent) return null;

  if (!detectNumerologyTopics(userContent).includes("pythagoras_square")) {
    return null;
  }

  return pythagorasSquare(birthDate);
}
