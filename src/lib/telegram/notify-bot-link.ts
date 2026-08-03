/** Best-effort: tell the bot that Telegram was linked to a Zovus account. */
export async function notifyBotAccountLinked(input: {
  telegramUserId: number;
  profileUserId: string | null;
}): Promise<void> {
  const base = (process.env.BOT_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  const secret = process.env.BOT_INTERNAL_SECRET?.trim() || "";
  if (!base || !secret) return;

  try {
    const res = await fetch(`${base}/internal/account-linked`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Bot-Internal-Secret": secret,
      },
      body: JSON.stringify({
        telegram_user_id: input.telegramUserId,
        zovus_user_id: input.profileUserId,
      }),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      console.warn("[notify-bot-link] failed", res.status);
    }
  } catch (err) {
    console.warn("[notify-bot-link]", err instanceof Error ? err.message : err);
  }
}
