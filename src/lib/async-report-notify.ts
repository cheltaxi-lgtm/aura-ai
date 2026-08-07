import { getNotificationPrefs } from "@/lib/daily-reminder-service";
import { sendEmail } from "@/lib/email/send";
import { dispatchNotification } from "@/lib/notify";
import { query } from "@/lib/db";

async function getProfileContact(
  userId: string
): Promise<{ name: string | null; email: string | null }> {
  const { rows } = await query<{ name: string | null; email: string | null }>(
    `SELECT u.name, ua.email
     FROM users u
     LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [userId]
  );
  return rows[0] ?? { name: null, email: null };
}

/**
 * Best-effort ready notice after a paid report completes.
 * Never throws to the caller — must not block generation lifecycle.
 */
export async function notifyPaidReportReady(input: {
  userId: string;
  kind: string;
  title?: string;
  ctaPath: string;
}): Promise<void> {
  try {
    const title = input.title ?? "Отчёт готов";
    const body = "Можно открыть постоянную ссылку — повторного списания рун не будет.";
    const prefs = await getNotificationPrefs(input.userId).catch(() => ({
      dailyInApp: true,
      dailyEmail: true,
    }));

    if (prefs.dailyInApp !== false) {
      await dispatchNotification({
        userId: input.userId,
        type: "report_ready",
        title,
        body,
        ctaPath: input.ctaPath,
        ctaLabel: "Открыть отчёт",
        data: { kind: input.kind },
      }).catch((err) => console.warn("[report-notify] in-app failed:", err));
    }

    if (prefs.dailyEmail === false) return;
    const { name, email } = await getProfileContact(input.userId);
    if (!email) return;
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://zovus.ru").replace(/\/$/, "");
    const ctaUrl = `${appUrl}${input.ctaPath.startsWith("/") ? input.ctaPath : `/${input.ctaPath}`}`;
    await sendEmail({
      to: email,
      subject: `Zovus — ${title}`,
      html: `<p>${name ? `${name}, ` : ""}ваш отчёт готов.</p><p><a href="${ctaUrl}">Открыть</a></p><p>${body}</p>`,
      text: `${title}. ${body} ${ctaUrl}`,
      template: "report_ready",
    });
  } catch (err) {
    console.warn("[report-notify] failed:", err);
  }
}

export function ctaPathForReportKind(
  kind: string,
  result: Record<string, unknown>
): string | null {
  if (kind === "hd_report") {
    const report = result.report as { chartId?: string } | undefined;
    const chartId =
      report?.chartId ||
      (typeof result.chartId === "string" ? result.chartId : null);
    return chartId ? `/cabinet/human-design?chart=${chartId}` : "/cabinet/human-design";
  }
  if (kind === "hd_composite_report") return "/cabinet/human-design";
  if (kind.startsWith("natal_")) return "/cabinet/natal";
  if (kind === "numerology_reading") return "/cabinet/numerology";
  if (kind === "pro_premium_report") {
    const caseId = typeof result.caseId === "string" ? result.caseId : null;
    return caseId ? `/pro/cases/${caseId}` : "/pro";
  }
  return null;
}
