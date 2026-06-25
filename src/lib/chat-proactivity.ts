/**
 * Observability for master proactivity in live chat.
 *
 * Chat replies are required (by the system prompt) to end with a forward move —
 * a clarifying question OR a continuation hook — so the dialogue never stalls.
 * This is a prompt-level rule with no hard guarantee, so we detect replies that
 * lack any forward momentum and log them. The signal feeds prompt tuning and
 * can later gate a regeneration / soft-append if the miss rate is high.
 */

/** Hook phrases that signal the master is pulling the conversation forward. */
const FORWARD_HOOK_PATTERNS: RegExp[] = [
  /\bспроси\w*/i,
  /\bнапиш\w*/i,
  /\bрасскаж\w*/i,
  /\bпродолж\w*/i,
  /\bдальше\b/i,
  /\bследующ\w*/i,
  /\bхочешь\b/i,
  /\bготов[аы]?\b/i,
  /\bвернись\b/i,
  /\bприход\w*/i,
  /\bя рядом\b/i,
  /\bжду\b/i,
];

/** True when the reply ends with a question or contains a continuation hook. */
export function replyHasForwardMomentum(reply: string): boolean {
  const text = reply?.trim();
  if (!text) return false;
  if (text.includes("?")) return true;
  return FORWARD_HOOK_PATTERNS.some((re) => re.test(text));
}

/** Logs a warning when a successful chat reply lacks any forward move. */
export function assertChatProactivity(reply: string, characterId: string): boolean {
  const ok = replyHasForwardMomentum(reply);
  if (!ok) {
    console.warn(
      `[proactivity] flat reply (no question/hook): character=${characterId} len=${reply?.trim().length ?? 0}`
    );
  }
  return ok;
}
