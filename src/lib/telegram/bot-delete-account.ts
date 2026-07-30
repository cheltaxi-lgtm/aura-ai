/**
 * Full Zovus account erasure initiated from the Telegram bot (152-FZ).
 */
import { checkRateLimit, rateLimitKey } from "@/lib/rate-limit";
import { deleteUserAccountCompletely, deleteUserAccountOnly } from "@/lib/user-deletion";
import { resolveBotUser } from "@/lib/telegram/bot-resolve";

export type BotDeleteAccountResult =
  | {
      ok: true;
      deleted: true;
      accountRemoved: number;
      userRemoved: number;
    }
  | {
      ok: false;
      error: "not_linked" | "rate_limit" | "internal";
      message: string;
      retryAfterSec?: number;
    };

export async function botDeleteAccount(telegramUserId: number): Promise<BotDeleteAccountResult> {
  const resolved = await resolveBotUser(telegramUserId);
  if (!resolved.linked || !resolved.accountId) {
    return {
      ok: false,
      error: "not_linked",
      message: "Аккаунт Zovus не найден. Данные в боте можно очистить локально.",
    };
  }

  const { allowed, retryAfterSec } = await checkRateLimit(
    rateLimitKey("bot_user_delete", resolved.accountId),
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
    if (!resolved.profileUserId) {
      const result = await deleteUserAccountOnly(resolved.accountId);
      return {
        ok: true,
        deleted: true,
        accountRemoved: result.accountRemoved,
        userRemoved: 0,
      };
    }

    const result = await deleteUserAccountCompletely(
      resolved.accountId,
      resolved.profileUserId
    );
    return {
      ok: true,
      deleted: true,
      accountRemoved: result.accountRemoved,
      userRemoved: result.userRemoved,
    };
  } catch (err) {
    console.error("[bot-delete-account]", err);
    return {
      ok: false,
      error: "internal",
      message: "Не удалось удалить аккаунт. Попробуйте позже или удалите в кабинете на сайте.",
    };
  }
}
