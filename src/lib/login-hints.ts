/** Login hints disabled to prevent account role enumeration. */
export async function resolveLoginHint(
  _email: string,
  _role: "user" | "expert"
): Promise<string | null> {
  return null;
}

/** Safe static copy for login forms — no account enumeration. */
export function getLoginFormHints(role: "user" | "expert"): string[] {
  const base = [
    "Проверьте раскладку клавиатуры и Caps Lock.",
    "Пароль чувствителен к регистру.",
  ];
  if (role === "user") {
    base.push("Нет аккаунта — зарегистрируйтесь на соседней вкладке.");
  }
  return base;
}

export const LOGIN_FAILURE_MESSAGE = "Неверный email или пароль";
