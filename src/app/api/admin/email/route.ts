import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { getEmailLogStats, listRecentEmailLog } from "@/lib/email/log";
import { getEmailTransportStatus } from "@/lib/email/send";
import {
  getAdminNotifyEmail,
  getClaimsEmail,
  getPrivacyEmail,
  getSupportEmail,
  SERVICE_MAILBOXES,
} from "@/lib/email/mail-config";

export async function GET() {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [stats, recent] = await Promise.all([getEmailLogStats(24), listRecentEmailLog(40)]);

  return NextResponse.json({
    transport: getEmailTransportStatus(),
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
