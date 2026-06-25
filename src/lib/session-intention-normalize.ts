import { INTENTION_OPTIONS, type SessionIntention } from "@/lib/intention";
import { isSessionTopicId, type SessionTopicId } from "@/lib/session-topics";

export function normalizeSessionIntention(
  raw: string | null | undefined
): SessionIntention | SessionTopicId | null {
  if (!raw?.trim()) return null;
  const value = raw.trim();
  if (isSessionTopicId(value) || value === "life_death") return value as SessionTopicId;
  if (INTENTION_OPTIONS.some((o) => o.id === value)) return value as SessionIntention;
  return value as SessionIntention;
}
