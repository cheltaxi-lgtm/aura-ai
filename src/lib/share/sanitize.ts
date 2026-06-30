const EMAIL_RE = /[\w.+-]+@[\w-]+\.[\w.-]+/gi;
const PHONE_RE = /(?:\+?\d[\d\s()-]{8,}\d)/g;

export function sanitizeDisplayName(name?: string | null): string | undefined {
  if (!name?.trim()) return undefined;
  const first = name.trim().split(/\s+/)[0] ?? "";
  if (!first || first.length > 32) return "Искатель";
  return first;
}

export function sanitizeExcerpt(text: string | undefined, maxLength: number): string {
  if (!text?.trim()) return "";
  let cleaned = text
    .replace(EMAIL_RE, "")
    .replace(PHONE_RE, "")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 1).trim()}…`;
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
