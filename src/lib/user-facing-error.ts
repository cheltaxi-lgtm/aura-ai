/** Map API / network error strings to safe Russian UI copy. Never show English codes as-is. */

const EXACT: Record<string, string> = {
  "Сервис временно недоступен. Попробуйте позже.": "Сервис временно недоступен. Попробуйте позже.",
  Unauthorized: "Войдите, чтобы продолжить.",
  Forbidden: "Недостаточно прав для этого действия.",
  "Feature disabled": "Раздел временно недоступен.",
  "Invalid JSON": "Не удалось обработать запрос. Попробуйте снова.",
  "Invalid multipart body": "Не удалось загрузить файл. Попробуйте другое фото.",
  "TTS not configured": "Озвучка временно недоступна.",
  "TTS disabled for this master": "Озвучка для этого наставника недоступна.",
  "text required": "Нет текста для озвучки.",
  "text too long": "Текст слишком длинный для озвучки.",
  "Synthesis failed": "Не удалось озвучить ответ.",
  "TTS error": "Озвучка временно недоступна.",
  VISION_UNAVAILABLE: "Распознавание временно недоступно. Попробуйте позже.",
  NOT_A_SPREAD: "На фото не удалось распознать расклад. Проверьте кадр и попробуйте снова.",
  CONFIRMATION_REQUIRED: "Подтвердите распознанные карты, чтобы продолжить.",
  INCOMPLETE_SPREAD: "Расклад неполный — отметьте все карты и позиции.",
  rate_limit: "Слишком много попыток. Подождите и попробуйте снова.",
  rate_limited: "Слишком много попыток. Подождите и попробуйте снова.",
  unauthorized: "Войдите, чтобы продолжить.",
  forbidden: "Недостаточно прав для этого действия.",
};

const CONTAINS: Array<{ re: RegExp; message: string }> = [
  { re: /database unavailable/i, message: EXACT["Сервис временно недоступен. Попробуйте позже."] },
  { re: /unauthorized/i, message: EXACT.Unauthorized },
  { re: /forbidden/i, message: EXACT.Forbidden },
  { re: /feature disabled/i, message: EXACT["Feature disabled"] },
  { re: /invalid json/i, message: EXACT["Invalid JSON"] },
  { re: /tts|synthesis/i, message: "Озвучка временно недоступна." },
  { re: /vision|not_a_spread|incomplete_spread/i, message: "Не удалось распознать расклад. Проверьте фото и попробуйте снова." },
  { re: /network|fetch failed|failed to fetch/i, message: "Сеть недоступна. Проверьте соединение." },
];

function looksEnglishCode(raw: string): boolean {
  if (!/[A-Za-z]/.test(raw)) return false;
  if (/[А-Яа-яЁё]/.test(raw)) return false;
  return true;
}

/** Prefer Russian message; fall back safely when API returns English codes. */
export function toUserFacingError(
  raw: unknown,
  fallback = "Что-то пошло не так. Попробуйте снова."
): string {
  const text = String(raw ?? "").trim();
  if (!text) return fallback;

  if (EXACT[text]) return EXACT[text];

  for (const { re, message } of CONTAINS) {
    if (re.test(text)) return message;
  }

  if (looksEnglishCode(text)) return fallback;
  return text;
}

export function pickUserFacingError(
  data: { message?: unknown; error?: unknown } | null | undefined,
  fallback = "Что-то пошло не так. Попробуйте снова."
): string {
  const message = typeof data?.message === "string" ? data.message.trim() : "";
  const error = typeof data?.error === "string" ? data.error.trim() : "";
  if (message && !looksEnglishCode(message)) return message;
  if (error) return toUserFacingError(error, fallback);
  if (message) return toUserFacingError(message, fallback);
  return fallback;
}
