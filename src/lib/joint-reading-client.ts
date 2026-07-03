export async function postJointReadingComplete(
  token: string,
  body: {
    reading: string;
    cards: { name: string; position?: string }[];
    sessionId?: string;
    characterKey: string;
    role: "initiator" | "partner";
  }
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`/api/joint-reading/${encodeURIComponent(token)}/complete`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json()) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? "Не удалось сохранить совместный расклад." };
    return { ok: true };
  } catch {
    return { ok: false, error: "Не удалось сохранить совместный расклад." };
  }
}
