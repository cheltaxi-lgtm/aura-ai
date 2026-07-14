import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { getEmailLogStats, listRecentEmailLog } from "@/lib/email/log";
import { getEmailTransportStatus } from "@/lib/email/send";
import {
  getAdminNotifyEmail,
  getClaimsEmail,
  getEmailSetupGaps,
  getPrivacyEmail,
  getSupportEmail,
  isEmailConfigured,
  SERVICE_MAILBOXES,
} from "@/lib/email/mail-config";

const EMAIL_TEMPLATES = [
  { id: "welcome", label: "Приветствие после регистрации" },
  { id: "password_reset", label: "Сброс пароля" },
  { id: "password_changed", label: "Пароль успешно изменён" },
  { id: "daily_reminder", label: "Напоминание о картах дня (cron)" },
  { id: "joint_reading_partner", label: "Совместный расклад — партнёр завершил" },
  { id: "joint_reading_done", label: "Совместный расклад — оба готовы" },
  { id: "joint_reading_expiring", label: "Совместный расклад — истекает приглашение" },
  { id: "support_auto_reply", label: "Поддержка — автоответ пользователю" },
  { id: "support_admin_new", label: "Поддержка — алерт админу" },
  { id: "support_reply", label: "Поддержка — ответ админа" },
];

export async function GET() {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [stats, recent] = await Promise.all([getEmailLogStats(24), listRecentEmailLog(40)]);

  return NextResponse.json({
    transport: getEmailTransportStatus(),
    configured: isEmailConfigured(),
    setupGaps: getEmailSetupGaps(),
    templates: EMAIL_TEMPLATES,
    mailboxes: {
      ...SERVICE_MAILBOXES,
      supportResolved: getSupportEmail(),
      privacyResolved: getPrivacyEmail(),
      claimsResolved: getClaimsEmail(),
      adminNotify: getAdminNotifyEmail(),
    },
    stats24h: stats,
    recent,
  });
}

export async function POST(request: NextRequest) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const to = typeof body.to === "string" && body.to.includes("@") ? body.to.trim() : auth.email;

  const { sendEmail } = await import("@/lib/email/send");
  const ok = await sendEmail({
    to,
    subject: "Zovus — тест почты",
    html: `<p>Тестовое письмо от админки Zovus (${new Date().toISOString()}).</p>`,
    text: "Тест почты Zovus",
    template: "admin_test",
  });

  return NextResponse.json({ ok, sent: ok });
}
