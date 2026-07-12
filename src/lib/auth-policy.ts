/** Shared password policy for user/expert/admin registration. */
export const MIN_PASSWORD_LENGTH = 12;
export const MIN_DISPLAY_NAME_LENGTH = 2;
export const MAX_DISPLAY_NAME_LENGTH = 80;

export function validatePasswordLength(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Пароль минимум ${MIN_PASSWORD_LENGTH} символов`;
  }
  return null;
}

export function validateDisplayName(name: unknown): string | null {
  if (typeof name !== "string") return "Укажите имя";
  const trimmed = name.trim();
  if (trimmed.length < MIN_DISPLAY_NAME_LENGTH) {
    return `Имя минимум ${MIN_DISPLAY_NAME_LENGTH} символа`;
  }
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    return `Имя не длиннее ${MAX_DISPLAY_NAME_LENGTH} символов`;
  }
  return null;
}
