/** Map HD API error payloads to user-facing Russian messages. */

const MACHINE_CODES: Record<string, string> = {
  rate_limit: "Слишком много запросов. Подождите немного и попробуйте снова.",
  message_too_long: "Сократите сообщение — максимум 2000 символов.",
  insufficient_runes: "Недостаточно рун для этого действия.",
};

export function hdApiErrorMessage(data: unknown, fallback: string): string {
  const d = data as { error?: unknown; message?: unknown } | null;
  if (typeof d?.message === "string" && d.message) return d.message;
  if (typeof d?.error === "string" && d.error) {
    const known = MACHINE_CODES[d.error];
    if (known) return known;
    // snake_case tokens are machine codes — never show them raw to the user.
    return /^[a-z0-9_]+$/.test(d.error) ? fallback : d.error;
  }
  return fallback;
}
