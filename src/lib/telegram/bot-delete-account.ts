/**
 * Full Zovus account erasure initiated from the Telegram bot (152-FZ).
 */
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { pendingTelegramErasure, requestAccountErasure } from "@/lib/account-erasure";
import { findTelegramIdentity } from "@/lib/telegram/accounts";

export type BotDeleteAccountResult =
  | {
      ok: true;
      deleted: false;
      pending: true;
      operationId: string;
    }
  | {
      ok: false;
      error: "not_linked" | "rate_limit" | "internal";
      message: string;
      retryAfterSec?: number;
    };

export async function botDeleteAccount(telegramUserId: number): Promise<BotDeleteAccountResult> {
  const pending = await pendingTelegramErasure(telegramUserId);
  if (pending) return { ok: true, deleted: false, pending: true, operationId: pending.id };
  const identity = await findTelegramIdentity(telegramUserId);
  if (!identity) {
    return {
      ok: false,
      error: "not_linked",
      message: "Аккаунт Zovus не найден. Данные в боте можно очистить локально.",
    };
  }

  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("bot_user_delete", identity.user_account_id),
    3,
    86_400_000
  );
  if (!allowed) {
    return {
      ok: false,
      error: "rate_limit",
      message: "Удаление аккаунта можно выполнять не чаще нескольких раз в сутки.",
      retryAfterSec,
    };
  }

  try {
    const result = await requestAccountErasure(identity.user_account_id);
    return { ok: true, deleted: false, pending: true, operationId: result.operationId };
  } catch (err) {
    console.error("[bot-delete-account]", err);
    return {
      ok: false,
      error: "internal",
      message: "Не удалось удалить аккаунт. Попробуйте позже или удалите в кабинете на сайте.",
    };
  }
}
