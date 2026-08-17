import { NextResponse } from "next/server";

import { ensureDb, query } from "@/lib/db";
import { getNotificationPrefs } from "@/lib/daily-reminder-service";
import { pickDeliverableEmail } from "@/lib/email/mail-config";
import { ACCOUNT_DELIVERABLE_EMAIL_SQL } from "@/lib/reminder-contacts";
import { getTelegramStatusForProfileUser } from "@/lib/telegram/accounts";
import { profileAuthFailureResponse, resolveProfileUserContext } from "@/lib/require-auth";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  const head = local.slice(0, 1) || "•";
  return `${head}•••@${domain}`;
}

/**
 * Which "отчёт готов" channels actually reach this user — drives the honest
 * channel list on the «Отчёт принят» screen. Never exposes raw contacts.
 */
export async function GET() {
  const resolved = await resolveProfileUserContext();
  if (!resolved.ok) {
    return profileAuthFailureResponse(resolved.reason);
  }
  if (!(await ensureDb())) {
    return NextResponse.json(
      { error: "Сервис временно недоступен. Попробуйте позже." },
      { status: 503 }
    );
  }

  const [prefs, contact, telegram] = await Promise.all([
    getNotificationPrefs(resolved.profileUserId),
    query<{ deliverable_email: string | null }>(
      `SELECT (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) AS deliverable_email
       FROM user_accounts ua WHERE ua.profile_user_id = $1 LIMIT 1`,
      [resolved.profileUserId]
    ).then((r) => r.rows[0] ?? null),
    getTelegramStatusForProfileUser(resolved.profileUserId).catch(() => ({
      linked: false as const,
    })),
  ]);

  const email = pickDeliverableEmail(contact?.deliverable_email);

  return NextResponse.json({
    inApp: { available: true },
    email: {
      available: Boolean(email),
      enabled: prefs.reportReadyEmail !== false,
      masked: email ? maskEmail(email) : null,
    },
    telegram: {
      linked: telegram.linked === true,
      enabled: prefs.reportReadyTelegram !== false,
      username: telegram.linked ? telegram.username ?? null : null,
    },
  });
}
