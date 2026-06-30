const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const PHONE_RE = /(?:\+?\d[\d\s()-]{8,}\d)/g;

/** Hard safety cap for stored body text (~100 KB). */
export const SHARE_BODY_MAX = 100_000;

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

/** Clean reading body for storage — no truncation, only PII strip + markdown cleanup. */
export function sanitizeShareBody(text: string | undefined): string {
  if (!text?.trim()) return "";
  let cleaned = plainTextFromMarkdown(text)
    .replace(EMAIL_RE, "")
    .replace(PHONE_RE, "");
  cleaned = normalizeExcerptWhitespace(cleaned);
  if (cleaned.length <= SHARE_BODY_MAX) return cleaned;
  const slice = cleaned.slice(0, SHARE_BODY_MAX - 1);
  const lastBreak = slice.lastIndexOf("\n\n");
  const cut = lastBreak > SHARE_BODY_MAX * 0.8 ? slice.slice(0, lastBreak) : slice;
  return `${cut.trim()}…`;
}

/** @deprecated use sanitizeShareBody */
export function sanitizeExcerpt(text: string | undefined, maxLength: number): string {
  const body = sanitizeShareBody(text);
  if (body.length <= maxLength) return body;
  return `${body.slice(0, maxLength - 1).trim()}…`;
}

export function sanitizeSharePayload<T extends { title?: string; excerpt?: string; userName?: string }>(
  input: T,
  _maxExcerptLength?: number
): T {
  return {
    ...input,
    title: (input.title ?? "Расклад Zovus").trim().slice(0, 120),
    excerpt: input.excerpt ? sanitizeShareBody(input.excerpt) : undefined,
    userName: sanitizeDisplayName(input.userName),
  };
}
