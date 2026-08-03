/** Best-effort: push support reply into Telegram bot. */
export async function notifyBotSupportReply(input: {
  telegramUserId: number;
  ticketId: string;
  subject: string;
  preview: string;
}): Promise<void> {
  const base = (process.env.BOT_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  const secret = process.env.BOT_INTERNAL_SECRET?.trim() || "";
  if (!base || !secret) return;

  try {
    const res = await fetch(`${base}/internal/support-reply`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Internal-Secret": secret,
      },
      body: JSON.stringify({
        telegram_user_id: input.telegramUserId,
        ticket_id: input.ticketId,
        subject: input.subject.slice(0, 160),
        preview: input.preview.slice(0, 800),
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn("[notify-bot-support] failed", res.status);
    }
  } catch (err) {
    console.warn("[notify-bot-support]", err instanceof Error ? err.message : err);
  }
}
