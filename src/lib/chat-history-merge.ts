import { MIN_SPREAD_READING_CHARS } from "@/lib/chat-cache";

export type HistoryMessageRow = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

function hasSpreadReading(messages: HistoryMessageRow[], minChars = MIN_SPREAD_READING_CHARS): boolean {
  return messages.some(
    (m) => m.role === "assistant" && (m.content?.trim().length ?? 0) >= minChars
  );
}

/** Prepend spread reading when chat_messages lack it but history/session still has the spread. */
export function mergeSpreadReadingIntoMessages(
  messages: HistoryMessageRow[],
  spreadReading: string | null | undefined,
  anchorTime?: Date
): HistoryMessageRow[] {
  const reading = spreadReading?.trim();
  if (!reading || reading.length < MIN_SPREAD_READING_CHARS) return messages;
  if (hasSpreadReading(messages)) return messages;

  const ts = anchorTime ?? new Date();
  const spreadMsg: HistoryMessageRow = {
    id: `spread-${ts.getTime()}`,
    role: "assistant",
    content: reading,
    timestamp: new Date(ts.getTime() - 1000).toISOString(),
  };
  return [spreadMsg, ...messages];
}
