export const RECAPTCHA_SCOPES = [
  "register",
  "login",
  "expertRegister",
  "expertLogin",
  "adminLogin",
  "support",
  "partners",
  "chat",
  "payments",
  "share",
  "reviews",
] as const;

export type RecaptchaScope = (typeof RECAPTCHA_SCOPES)[number];

export type RecaptchaScopeSettings = Record<RecaptchaScope, boolean>;

export const DEFAULT_RECAPTCHA_SCOPES: RecaptchaScopeSettings = {
  register: true,
  login: true,
  expertRegister: true,
  expertLogin: true,
  // Always force-exempted in verifyRecaptchaForScope (see recaptcha.ts) to
  // prevent a low score from locking every admin out with no way back in.
  adminLogin: false,
  support: true,
  partners: true,
  chat: true,
  payments: true,
  share: false,
  reviews: true,
};

export const RECAPTCHA_SCOPE_LABELS: Record<RecaptchaScope, string> = {
  register: "Регистрация пользователя",
  login: "Вход пользователя",
  expertRegister: "Регистрация эзотерика",
  expertLogin: "Вход эзотерика",
  adminLogin: "Вход в админку (защита от самоблокировки)",
  support: "Техподдержка (сообщения)",
  partners: "Заявка на партнёрство (лендинг)",
  chat: "Чат с мастером",
  payments: "Оплата и покупка рун",
  share: "Создание публичной ссылки (гость)",
  reviews: "Отзыв на лендинге",
};

export function mergeRecaptchaScopes(
  partial?: Partial<RecaptchaScopeSettings> | null
): RecaptchaScopeSettings {
  return { ...DEFAULT_RECAPTCHA_SCOPES, ...(partial ?? {}) };
}
