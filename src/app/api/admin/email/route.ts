import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import {
  countEmailLogForPurge,
  deleteEmailLog,
  getEmailLogStats,
  getEmailLogStatsByTemplate,
  getReengagementEmailStats,
  listEmailLog,
  purgeReengagementLog,
  type EmailLogStatus,
} from "@/lib/email/log";
import { getEmailTransportStatus, sendEmail } from "@/lib/email/send";
import { EMAIL_TEMPLATE_REGISTRY, getTemplateById } from "@/lib/email/template-registry";
import {
  getAdminNotifyEmail,
  getClaimsEmail,
  getEmailSetupGaps,
  getPrivacyEmail,
  getSupportEmail,
  isEmailConfigured,
  SERVICE_MAILBOXES,
} from "@/lib/email/mail-config";
import { runReengagementEmailBatch } from "@/lib/reengagement-email-service";

const CRON_JOBS = [
  {
    id: "daily-reading-remind",
    label: "Карты дня",
    schedule: "Каждый час (UTC cron → час МСК в API)",
    endpoint: "/api/cron/daily-reading-remind",
    description: "In-app + email, если расклад на сегодня ещё не открыт.",
  },
  {
    id: "reengagement-emails",
    label: "Re-engagement",
    schedule: "Каждый час; бонус рун — 19:00 МСК, win-back — 10:00 МСК",
    endpoint: "/api/cron/reengagement-emails",
    description: "Напоминание о рунах и письма неактивным пользователям.",
  },
  {
    id: "joint-reading-sweep",
    label: "Совместные расклады",
    schedule: "05:20 UTC ежедневно",
    endpoint: "/api/cron/joint-reading-sweep",
    description: "Истечение приглашений и email партнёрам.",
  },
  {
    id: "guest-resume-expire",
    label: "Guest triplet resume TTL",
    schedule: "05:35 UTC ежедневно (proxmox-setup/install-crons.sh)",
    endpoint: "/api/cron/guest-resume-expire",
    description: "Помечает expired только unclaimed issued-чеки старше 24ч.",
  },
];

function parsePurgeParams(body: Record<string, unknown>) {
  const olderThanDays =
    typeof body.olderThanDays === "number" && body.olderThanDays > 0
      ? body.olderThanDays
      : undefined;
  const status = body.status as EmailLogStatus | undefined;
  const template = typeof body.template === "string" ? body.template : undefined;
  const purgeAll = body.purgeAll === true;
  const validStatus =
    status && ["sent", "failed", "skipped"].includes(status) ? status : undefined;

  if (!purgeAll && !olderThanDays && !validStatus && !template) {
    return { error: "Укажите статус, шаблон, возраст или purgeAll" as const };
  }

  return {
    olderThanDays,
    status: validStatus,
    template,
    all: purgeAll,
  };
}

export async function GET(request: NextRequest) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const status = sp.get("status") as EmailLogStatus | null;
  const template = sp.get("template")?.trim() || undefined;
  const recipient = sp.get("recipient")?.trim() || undefined;
  const sinceHours = sp.get("sinceHours") ? Number(sp.get("sinceHours")) : 168;
  const limit = sp.get("limit") ? Number(sp.get("limit")) : 50;
  const offset = sp.get("offset") ? Number(sp.get("offset")) : 0;

  if (sp.get("purgePreview") === "1") {
    const purgeAllFlag = sp.get("purgeAll") === "1";
    const olderThanDays = sp.get("olderThanDays") ? Number(sp.get("olderThanDays")) : undefined;
    const previewStatusRaw = sp.get("purgeStatus");
    const wipeAll =
      purgeAllFlag ||
      (previewStatusRaw === "" && !(olderThanDays && olderThanDays > 0));
    const previewStatus =
      previewStatusRaw && ["sent", "failed", "skipped"].includes(previewStatusRaw)
        ? (previewStatusRaw as EmailLogStatus)
        : undefined;
    const count = await countEmailLogForPurge({
      all: wipeAll,
      olderThanDays: olderThanDays && olderThanDays > 0 ? olderThanDays : undefined,
      status: previewStatus,
    });
    return NextResponse.json({ count });
  }

  const [stats24h, stats7d, byTemplate, reengagementStats, logPage] = await Promise.all([
    getEmailLogStats(24),
    getEmailLogStats(168),
    getEmailLogStatsByTemplate(168),
    getReengagementEmailStats(30),
    listEmailLog({
      status: status && ["sent", "failed", "skipped"].includes(status) ? status : undefined,
      template,
      recipient,
      sinceHours: Number.isFinite(sinceHours) ? sinceHours : 168,
      limit: Number.isFinite(limit) ? limit : 50,
      offset: Number.isFinite(offset) ? offset : 0,
    }),
  ]);

  return NextResponse.json({
    transport: getEmailTransportStatus(),
    configured: isEmailConfigured(),
    setupGaps: getEmailSetupGaps(),
    templates: EMAIL_TEMPLATE_REGISTRY.map((t) => ({
      id: t.id,
      label: t.label,
      category: t.category,
      description: t.description,
    })),
    cronJobs: CRON_JOBS,
    mailboxes: {
      ...SERVICE_MAILBOXES,
      supportResolved: getSupportEmail(),
      privacyResolved: getPrivacyEmail(),
      claimsResolved: getClaimsEmail(),
      adminNotify: getAdminNotifyEmail(),
    },
    stats24h,
    stats7d,
    byTemplate,
    reengagementStats,
    log: logPage,
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const action = typeof body.action === "string" ? body.action : "test";

  if (action === "preview") {
    const templateId = typeof body.templateId === "string" ? body.templateId : "";
    const tpl = getTemplateById(templateId);
    if (!tpl) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    return NextResponse.json({
      templateId: tpl.id,
      subject: tpl.previewSubject,
      html: tpl.previewHtml(),
    });
  }

  if (action === "send_template") {
    const templateId = typeof body.templateId === "string" ? body.templateId : "";
    const tpl = getTemplateById(templateId);
    if (!tpl) return NextResponse.json({ error: "Unknown template" }, { status: 400 });
    const to =
      typeof body.to === "string" && body.to.includes("@") ? body.to.trim() : auth.email;
    const ok = await sendEmail({
      to,
      subject: `[Тест] ${tpl.previewSubject}`,
      html: tpl.previewHtml(),
      text: `Тест шаблона ${tpl.id}`,
      template: tpl.id,
    });
    return NextResponse.json({ ok, sent: ok, to });
  }

  if (action === "run_reengagement") {
    const result = await runReengagementEmailBatch({
      dailyBonus: body.dailyBonus !== false,
      inactive: body.inactive !== false,
    });
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === "purge_logs") {
    const params = parsePurgeParams(body as Record<string, unknown>);
    if ("error" in params) {
      return NextResponse.json({ error: params.error }, { status: 400 });
    }
    const deleted = await deleteEmailLog(params);
    return NextResponse.json({ ok: true, deleted });
  }

  const to = typeof body.to === "string" && body.to.includes("@") ? body.to.trim() : auth.email;
  const ok = await sendEmail({
    to,
    subject: "Zovus — тест почты",
    html: `<p>Тестовое письмо от админки Zovus (${new Date().toISOString()}).</p>`,
    text: "Тест почты Zovus",
    template: "admin_test",
  });

  return NextResponse.json({ ok, sent: ok, to });
}

export async function DELETE(request: NextRequest) {
  await ensureDb();
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const params = parsePurgeParams(body as Record<string, unknown>);
  if ("error" in params) {
    return NextResponse.json({ error: params.error }, { status: 400 });
  }

  const purgeReengagement =
    body.purgeReengagement === true && typeof body.reengagementOlderThanDays === "number";

  const deleted = await deleteEmailLog(params);

  let reengagementDeleted = 0;
  if (purgeReengagement && body.reengagementOlderThanDays > 0) {
    reengagementDeleted = await purgeReengagementLog(body.reengagementOlderThanDays);
  }

  return NextResponse.json({ deleted, reengagementDeleted });
}
