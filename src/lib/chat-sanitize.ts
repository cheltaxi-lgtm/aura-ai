import { getBloggerBySlug } from "@/lib/session";
import { isAiMasterId } from "@/lib/showcase-masters";

export const MAX_CHAT_HISTORY = 24;
export const MAX_USER_MESSAGE_LENGTH = 1000;

const ALLOWED_ROLES = new Set(["user", "assistant"]);

/** Strip control chars and null bytes that could confuse LLM parsers. */
export function stripControlChars(text: string): string {
  return text.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

export function sanitizeTextField(value: unknown, maxLen: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const cleaned = stripControlChars(value).trim().slice(0, maxLen);
  return cleaned || undefined;
}

export type ChatHistoryMessage = { role: "user" | "assistant"; content: string };

/** Keep only user/assistant turns, trim length, cap history depth. */
export function sanitizeChatHistory(
  messages: { role: string; content: string }[],
  maxMessages = MAX_CHAT_HISTORY,
  maxContentLength = MAX_USER_MESSAGE_LENGTH
): ChatHistoryMessage[] {
  if (!Array.isArray(messages)) return [];

  const cleaned: ChatHistoryMessage[] = [];
  for (const msg of messages) {
    if (!ALLOWED_ROLES.has(msg.role)) continue;
    const content = stripControlChars(String(msg.content ?? ""))
      .slice(0, maxContentLength)
      .trim();
    if (!content) continue;
    cleaned.push({ role: msg.role as "user" | "assistant", content });
  }

  return cleaned.slice(-maxMessages);
}

export type SanitizedUserProfile = {
  name?: string;
  gender?: string;
  zodiac?: string;
  birthDate?: string;
  birthTime?: string;
  birthCity?: string;
  lifeFocus?: string;
  mainQuestion?: string;
  astroMeta?: import("@/lib/astro-profile").AstroMeta;
};

export function sanitizeUserProfileForPrompt(
  profile?: SanitizedUserProfile
): SanitizedUserProfile | undefined {
  if (!profile) return undefined;
  return {
    ...profile,
    name: sanitizeTextField(profile.name, 80),
    gender: sanitizeTextField(profile.gender, 20),
    zodiac: sanitizeTextField(profile.zodiac, 40),
    birthDate: sanitizeTextField(profile.birthDate, 20),
    birthTime: sanitizeTextField(profile.birthTime, 10),
    birthCity: sanitizeTextField(profile.birthCity, 100),
    lifeFocus: sanitizeTextField(profile.lifeFocus, 40),
    mainQuestion: sanitizeTextField(profile.mainQuestion, 500),
  };
}

/** Whitelist AI master IDs; allow known human blogger slugs; fallback to ragnar. */
export async function resolveApiCharacterId(characterId: unknown): Promise<string> {
  if (typeof characterId !== "string") return "ragnar";
  const id = stripControlChars(characterId).trim().slice(0, 64);
  if (!id) return "ragnar";
  if (isAiMasterId(id)) return id;
  try {
    const blogger = await getBloggerBySlug(id);
    if (blogger) return id;
  } catch {
    /* DB unavailable — only allow known AI IDs */
  }
  return "ragnar";
}
