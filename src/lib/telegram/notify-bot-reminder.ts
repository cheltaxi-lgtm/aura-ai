/** Best-effort: push a proactive reminder into Telegram bot. */

export type BotReminderKind = "daily_cards" | "daily_bonus" | "inactive_7d" | "inactive_14d";

export async function notifyBotReminder(input: {
  telegramUserId: number;
  sourceProfileUserId: string;
  kind: BotReminderKind;
  title: string;
  body: string;
  ctaUrl: string;
  ctaLabel: string;
  unsubscribeUrl: string;
}): Promise<{ delivered: boolean; reason?: string }> {
  const base = (process.env.BOT_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  const secret = process.env.BOT_INTERNAL_SECRET?.trim() || "";
  if (!base || !secret) return { delivered: false, reason: "not_configured" };

  try {
    const res = await fetch(`${base}/internal/reminder`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Internal-Secret": secret,
      },
      body: JSON.stringify({
        telegram_user_id: input.telegramUserId,
        source_profile_user_id: input.sourceProfileUserId,
        kind: input.kind,
        title: input.title.slice(0, 160),
        body: input.body.slice(0, 400),
        cta_url: input.ctaUrl.slice(0, 512),
        cta_label: input.ctaLabel.slice(0, 48),
        unsubscribe_url: input.unsubscribeUrl.slice(0, 512),
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
