export const RETENTION_OPTIN_SURFACES = [
  "post_value",
  "authenticated_home",
  "cabinet",
] as const;

export type RetentionOptInSurface = (typeof RETENTION_OPTIN_SURFACES)[number];

export const RETENTION_OPTIN_TOPICS = [
  "personal_reminders",
  "daily_cards",
  "weekly_digest",
] as const;

export type RetentionOptInTopic = (typeof RETENTION_OPTIN_TOPICS)[number];

export const RETENTION_OPTIN_ACTIONS = ["accept", "decline", "shown"] as const;
export type RetentionOptInAction = (typeof RETENTION_OPTIN_ACTIONS)[number];

/** Prompt reappears after this quiet window if the user only saw it. */
export const RETENTION_OPTIN_SHOWN_COOLDOWN_MS = 7 * 86_400_000;
/** «Не сейчас» — do not re-prompt immediately. */
export const RETENTION_OPTIN_DECLINE_COOLDOWN_MS = 14 * 86_400_000;

export const RETENTION_OPTIN_COPY = {
  title: "Хотите, чтобы Zovus напоминал Вам, когда появится повод вернуться?",
  description:
    "Можем сообщать о доступных персональных возможностях и важных обновлениях. Настройки всегда можно изменить.",
  accept: "Да, напоминать",
  decline: "Не сейчас",
  choice: "Вы сами выбираете, какие напоминания получать.",
  cabinetHint: "Настройки можно изменить в кабинете.",
} as const;

export function isRetentionOptInSurface(value: unknown): value is RetentionOptInSurface {
  return (
    typeof value === "string" &&
    (RETENTION_OPTIN_SURFACES as readonly string[]).includes(value)
  );
}

export function isRetentionOptInAction(value: unknown): value is RetentionOptInAction {
  return (
    typeof value === "string" &&
    (RETENTION_OPTIN_ACTIONS as readonly string[]).includes(value)
  );
}

export function isRetentionOptInQuiet(
  quietUntil: string | null,
  now = new Date()
): boolean {
  if (!quietUntil) return false;
  const ms = Date.parse(quietUntil);
  return Number.isFinite(ms) && ms > now.getTime();
}
