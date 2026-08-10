/** Best-effort: push "отчёт готов" into Telegram bot. Mirrors notify-bot-support. */
export async function notifyBotReportReady(input: {
  telegramUserId: number;
  title: string;
  ctaUrl: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const base = (process.env.BOT_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  const secret = process.env.BOT_INTERNAL_SECRET?.trim() || "";
  if (!base || !secret) return { delivered: false, reason: "not_configured" };

  try {
    const res = await fetch(`${base}/internal/report-ready`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Internal-Secret": secret,
      },
      body: JSON.stringify({
        telegram_user_id: input.telegramUserId,
        title: input.title.slice(0, 160),
        cta_url: input.ctaUrl.slice(0, 512),
      }),
      signal: AbortSignal.timeout(4000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      delivered?: boolean;
      reason?: string;
    };
    if (!res.ok) return { delivered: false, reason: `http_${res.status}` };
    return { delivered: data.delivered === true, reason: data.reason };
  } catch (err) {
    return {
      delivered: false,
      reason: err instanceof Error ? err.message : "send_error",
    };
  }
}
