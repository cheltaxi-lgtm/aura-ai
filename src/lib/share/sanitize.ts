const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const PHONE_RE = /(?:\+?\d[\d\s()-]{8,}\d)/g;

/** Max chars shown on export cards (PNG / Stories). */
export const SHARE_CARD_EXCERPT_MAX = 320;

/** Max chars in messenger URL payloads (Telegram / WhatsApp links). */
export const SHARE_MESSAGE_URL_MAX = 1200;

export function plainTextFromMarkdown(text: string): string {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\r\n/g, "\n")
    .trim();
}

export function sanitizeDisplayName(name?: string | null): string | undefined {
  if (!name?.trim()) return undefined;
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first || first.length > 32) return "Искатель";
  return first;
}

function normalizeExcerptWhitespace(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function sanitizeExcerpt(text: string | undefined, maxLength: number): string {
  if (!text?.trim()) return "";
  let cleaned = plainTextFromMarkdown(text)
    .replace(EMAIL_RE, "")
    .replace(PHONE_RE, "");
  cleaned = normalizeExcerptWhitespace(cleaned);
  if (cleaned.length <= maxLength) return cleaned;
  const slice = cleaned.slice(0, maxLength - 1);
  const lastBreak = Math.max(slice.lastIndexOf("\n\n"), slice.lastIndexOf(". "));
  const cut = lastBreak > maxLength * 0.6 ? slice.slice(0, lastBreak) : slice;
  return `${cut.trim()}…`;
}

export function truncateForCard(text: string | undefined, maxLength = SHARE_CARD_EXCERPT_MAX): string {
  if (!text?.trim()) return "";
  const cleaned = normalizeExcerptWhitespace(text.trim());
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

export function truncateForShareUrl(
  text: string | undefined,
  maxLength = SHARE_MESSAGE_URL_MAX
): string {
  if (!text?.trim()) return "";
  const cleaned = text.trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
}

export function cardExcerptFromFull(fullExcerpt: string | undefined): string {
  return truncateForCard(fullExcerpt);
}

export function sanitizeSharePayload<T extends { title?: string; excerpt?: string; userName?: string }>(
  input: T,
  maxExcerptLength: number
): T {
  return {
    ...input,
    title: (input.title ?? "Расклад Zovus").trim().slice(0, 120),
    excerpt: input.excerpt ? sanitizeExcerpt(input.excerpt, maxExcerptLength) : undefined,
    userName: sanitizeDisplayName(input.userName),
  };
}
