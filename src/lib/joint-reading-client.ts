export async function postJointReadingComplete(
  token: string,
  body: {
    sessionId: string;
    role: "initiator" | "partner";
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!body.sessionId?.trim()) {
      return { ok: false, error: "Не удалось сохранить совместный расклад: нет сессии." };
    }
    const res = await fetch(`/api/joint-reading/${encodeURIComponent(token)}/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: body.sessionId.trim(),
        role: body.role,
      }),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Не удалось сохранить совместный расклад." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось сохранить совместный расклад." };
  }
}
