import { NextRequest, NextResponse } from "next/server";
import { ensureDb, queryClient, withTransaction } from "@/lib/db";
import {
  getAccountDailyCardsReminder,
  setAccountDailyCardsReminder,
} from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { updateNotificationPrefs } from "@/lib/daily-reminder-service";

export const dynamic = "force-dynamic";

function parseEnabled(body: unknown): boolean | null {
  if (!body || typeof body !== "object") return null;
  const raw = (body as { dailyCardsReminder?: unknown }).dailyCardsReminder;
  return typeof raw === "boolean" ? raw : null;
}

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const dailyCardsReminder = await getAccountDailyCardsReminder(auth.sub);
  return NextResponse.json({ dailyCardsReminder });
}

async function writePreference(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const enabled = parseEnabled(body);
  if (enabled == null) {
    return NextResponse.json({ error: "dailyCardsReminder_required" }, { status: 400 });
  }
  const channel = (body as { channel?: unknown }).channel;
  if (channel !== undefined && channel !== "telegram") {
    return NextResponse.json({ error: "invalid_channel" }, { status: 400 });
  }
  if (channel === "telegram") {
    const result = await withTransaction(async (client) => {
      const { rows } = await queryClient<{
        profile_user_id: string | null;
        daily_cards_reminder: boolean;
      }>(client, `SELECT ua.profile_user_id, ua.daily_cards_reminder
        FROM user_accounts ua
        WHERE ua.id=$1 AND ua.erasure_requested_at IS NULL FOR UPDATE`, [auth.sub]);
      const account = rows[0];
      if (!account?.profile_user_id) return { error: "profile_required", status: 403 } as const;
      if (enabled) {
        // Check after the account lock: a concurrent unlink may have completed
        // while this transaction waited for that lock.
        const linked = await queryClient(client,
          `SELECT 1 FROM user_telegram_identities WHERE user_account_id=$1 LIMIT 1`, [auth.sub]);
        if (!linked.rows.length) return { error: "telegram_not_linked", status: 409 } as const;
      }

      // A prior email unsubscribe can leave an old dailyEmail preference behind
      // while the shared gate is off. Do not reopen that channel on Telegram opt-in.
      const patch = enabled && !account.daily_cards_reminder
        ? { dailyTelegram: true, dailyEmail: false, dailyInApp: false }
        : { dailyTelegram: enabled };
      await queryClient(client, `UPDATE users
        SET notification_prefs=COALESCE(notification_prefs, '{}'::jsonb) || $2::jsonb
        WHERE id=$1`, [account.profile_user_id, JSON.stringify(patch)]);
      if (enabled) {
        await queryClient(client,
          `UPDATE user_accounts SET daily_cards_reminder=TRUE WHERE id=$1`, [auth.sub]);
      }
      return {
        status: 200,
        dailyCardsReminder: enabled || account.daily_cards_reminder,
        dailyTelegramReminder: enabled,
      } as const;
    });
    return NextResponse.json(result, { status: result.status });
  }
  const dailyCardsReminder = await setAccountDailyCardsReminder(auth.sub, enabled);
  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (profileUserId) {
    await updateNotificationPrefs(profileUserId, enabled
      ? { dailyEmail: true, dailyInApp: true }
      : { dailyEmail: false, dailyInApp: false, dailyTelegram: false });
  }
  return NextResponse.json({ dailyCardsReminder });
}

export async function PATCH(request: NextRequest) {
  return writePreference(request);
}

export async function POST(request: NextRequest) {
  return writePreference(request);
}
