/** Shared password policy for user/expert/admin registration. */
export const MIN_PASSWORD_LENGTH = 12;

export function validatePasswordLength(password: string): string | null {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `Пароль минимум ${MIN_PASSWORD_LENGTH} символов`;
  }
  return null;
}
