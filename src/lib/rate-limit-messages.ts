export const RATE_LIMIT_MESSAGES: Record<string, string> = {
  reading: "Слишком много раскладов. Подождите минуту.",
  photo_reading: "Слишком много фото-чтений. Подождите минуту.",
  intention_spread: "Слишком много раскладов. Подождите минуту.",
  image_generate: "Лимит изображений на сегодня исчерпан.",
  daily_bonus: "Ежедневный бонус уже получен сегодня.",
  rune_purchase: "Слишком много попыток покупки. Попробуйте позже.",
  default: "Слишком много запросов. Попробуйте позже.",
};

export function rateLimitMessage(action?: string): string {
  if (!action) return RATE_LIMIT_MESSAGES.default;
  return RATE_LIMIT_MESSAGES[action] ?? RATE_LIMIT_MESSAGES.default;
}
