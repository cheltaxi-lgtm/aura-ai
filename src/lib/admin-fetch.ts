"use client";

/**
 * Admin fetch that retries once after password step-up (X-Admin-Confirm-Password).
 * Server issues a 15-minute step-up cookie on success.
 */
export async function adminFetch(
  input: RequestInfo | URL,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  const first = await fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers,
  });

  if (first.status !== 401) return first;

  let code: string | undefined;
  try {
    const data = (await first.clone().json()) as { code?: string };
    code = data.code;
  } catch {
    return first;
  }

  if (code !== "step_up_required" && code !== "step_up_invalid") {
    return first;
  }

  const password =
    typeof window !== "undefined"
      ? window.prompt(
          code === "step_up_invalid"
            ? "Неверный пароль. Подтвердите пароль администратора ещё раз:"
            : "Подтвердите пароль администратора для опасного действия:"
        )
      : null;
  if (!password) return first;

  const retryHeaders = new Headers(init.headers);
  retryHeaders.set("X-Admin-Confirm-Password", password);
  return fetch(input, {
    ...init,
    credentials: init.credentials ?? "include",
    headers: retryHeaders,
  });
}
