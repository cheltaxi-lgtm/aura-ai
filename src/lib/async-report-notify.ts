import { getNotificationPrefs } from "@/lib/daily-reminder-service";
import { sendEmail } from "@/lib/email/send";
import { dispatchNotification } from "@/lib/notify";
import { resolveAsyncReportDestination } from "@/lib/async-report-destination";
import { isReportReadyTelegramEnabled } from "@/lib/async-report-flags";
import { getTelegramStatusForProfileUser } from "@/lib/telegram/accounts";
import { notifyBotReportReady } from "@/lib/telegram/notify-bot-report-ready";
import { query } from "@/lib/db";
import type { AsyncJobRow } from "@/lib/async-jobs";

/**
 * Guaranteed report-ready delivery.
 *
 * Completion creates one row per channel in async_job_notification_deliveries
 * (UNIQUE(job_id, channel) — idempotent across worker retries/restarts).
 * The worker tick processes due rows with backoff; a transient email/telegram
 * outage retries instead of silently losing the notice for a paid report.
 *
 * In-app is a transactional service message about a paid result — it is NOT
 * gated by daily/marketing prefs. Email/Telegram have dedicated prefs.
 */

const REPORT_READY_TITLES: Record<string, string> = {
  hd_report: "Разбор Human Design готов",
  hd_composite_report: "Разбор связи Human Design готов",
  pro_premium_report: "Pro-отчёт готов",
  numerology_reading: "Матрица готова",
  natal_interpretation: "Натальный разбор готов",
  natal_forecast: "Натальный прогноз готов",
  natal_compatibility: "Натальная совместимость готова",
};

const BODY =
  "Можно открыть постоянную ссылку — повторного списания рун не будет.";

/** Backoff ladder: immediate, 30s, 2m, 5m, 15m, 30m, 1h, 2h — then failed. */
const RETRY_DELAYS_MS = [
  0, 30_000, 120_000, 300_000, 900_000, 1_800_000, 3_600_000, 7_200_000,
];

type DeliveryChannel = "in_app" | "email" | "telegram";

type DeliveryRow = {
  id: string;
  job_id: string;
  user_id: string;
  channel: DeliveryChannel;
  title: string;
  cta_path: string | null;
  attempt_count: number;
};

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

async function insertDelivery(
  job: AsyncJobRow,
  channel: DeliveryChannel,
  status: "pending" | "skipped",
  title: string,
  ctaPath: string
): Promise<void> {
  await query(
    `INSERT INTO async_job_notification_deliveries
       (job_id, user_id, channel, status, title, cta_path)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (job_id, channel) DO NOTHING`,
    [job.id, job.user_id, channel, status, title, ctaPath]
  );
}

/**
 * Create per-channel delivery rows for a completed report job.
 * Never throws — must not block the generation lifecycle.
 */
export async function enqueueReportReadyDeliveries(
  job: AsyncJobRow,
  result: Record<string, unknown>
): Promise<void> {
  try {
    const ctaPath = resolveAsyncReportDestination({
      kind: job.kind,
      jobInput: job.input,
      result,
    });
    if (!ctaPath) return;
    const title = REPORT_READY_TITLES[job.kind] ?? "Отчёт готов";

    // In-app: transactional, always.
    await insertDelivery(job, "in_app", "pending", title, ctaPath);

    const prefs = await getNotificationPrefs(job.user_id).catch(() => ({
      reportReadyEmail: true,
      reportReadyTelegram: true,
    }));

    const { email } = await getProfileContact(job.user_id).catch(() => ({
      name: null,
      email: null,
    }));
    await insertDelivery(
      job,
      "email",
      prefs.reportReadyEmail !== false && email ? "pending" : "skipped",
      title,
      ctaPath
    );

    if (isReportReadyTelegramEnabled()) {
      const tg = await getTelegramStatusForProfileUser(job.user_id).catch(() => ({
        linked: false,
      }));
      await insertDelivery(
        job,
        "telegram",
        prefs.reportReadyTelegram !== false && tg.linked ? "pending" : "skipped",
        title,
        ctaPath
      );
    }
  } catch (err) {
    console.warn("[report-notify] enqueue failed:", err);
  }
}

async function deliverInApp(row: DeliveryRow): Promise<void> {
  // Idempotency across worker restarts: the notification itself carries jobId.
  const { rows } = await query<{ id: string }>(
    `SELECT id FROM notifications
     WHERE user_id = $1 AND type = 'report_ready'
       AND data->>'reportJobId' = $2
     LIMIT 1`,
    [row.user_id, row.job_id]
  );
  if (!rows[0]) {
    await dispatchNotification({
      userId: row.user_id,
      type: "report_ready",
      title: row.title,
      body: BODY,
      ctaPath: row.cta_path ?? "/cabinet",
      ctaLabel: "Открыть отчёт",
      data: { reportJobId: row.job_id },
      idempotencyKey: `report_ready:${row.job_id}`,
    });
  }
}

async function deliverEmail(row: DeliveryRow): Promise<void> {
  const { name, email } = await getProfileContact(row.user_id);
  if (!email) throw new Error("no_email");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://zovus.ru").replace(
    /\/$/,
    ""
  );
  const path = row.cta_path ?? "/cabinet";
  const ctaUrl = `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
  await sendEmail({
    to: email,
    subject: `Zovus — ${row.title}`,
    html: `<p>${name ? `${name}, ` : ""}ваш отчёт готов.</p><p><a href="${ctaUrl}">Открыть</a></p><p>${BODY}</p>`,
    text: `${row.title}. ${BODY} ${ctaUrl}`,
    template: "report_ready",
  });
}

async function deliverTelegram(row: DeliveryRow): Promise<void> {
  const tg = await getTelegramStatusForProfileUser(row.user_id);
  if (!tg.linked || !tg.telegramUserId) throw new Error("not_linked");
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "https://zovus.ru").replace(
    /\/$/,
    ""
  );
  const path = row.cta_path ?? "/cabinet";
  const ctaUrl = `${appUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const res = await notifyBotReportReady({
    telegramUserId: Number(tg.telegramUserId),
    title: row.title,
    ctaUrl,
  });
  if (!res.delivered) throw new Error(res.reason || "not_delivered");
}

async function markDelivered(id: string): Promise<void> {
  await query(
    `UPDATE async_job_notification_deliveries
     SET status = 'delivered', delivered_at = NOW(), updated_at = NOW(), last_error = NULL
     WHERE id = $1`,
    [id]
  );
}

async function markAttemptFailed(row: DeliveryRow, error: unknown): Promise<void> {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500);
  const attempts = row.attempt_count + 1;
  const delay = RETRY_DELAYS_MS[Math.min(attempts, RETRY_DELAYS_MS.length - 1)];
  const exhausted = attempts >= RETRY_DELAYS_MS.length;
  await query(
    `UPDATE async_job_notification_deliveries
     SET status = $2,
         attempt_count = $3,
         next_attempt_at = NOW() + ($4 || ' milliseconds')::interval,
         last_error = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [
      row.id,
      exhausted ? "failed" : "pending",
      attempts,
      String(delay),
      message,
    ]
  );
  if (exhausted) {
    console.error(
      `[report-notify] delivery exhausted job=${row.job_id} channel=${row.channel}: ${message}`
    );
  }
}

/**
 * Process due deliveries. Called from the worker tick; single worker process
 * means no concurrent processing of the same row.
 */
export async function processDueReportReadyDeliveries(limit = 10): Promise<number> {
  const { rows } = await query<DeliveryRow>(
    `SELECT id, job_id, user_id, channel, title, cta_path, attempt_count
     FROM async_job_notification_deliveries
     WHERE status = 'pending' AND next_attempt_at <= NOW()
     ORDER BY next_attempt_at
     LIMIT $1`,
    [limit]
  );
  let delivered = 0;
  for (const row of rows) {
    try {
      if (row.channel === "in_app") await deliverInApp(row);
      else if (row.channel === "email") await deliverEmail(row);
      else await deliverTelegram(row);
      await markDelivered(row.id);
      delivered += 1;
    } catch (error) {
      await markAttemptFailed(row, error);
    }
  }
  return delivered;
}

/** @deprecated Use resolveAsyncReportDestination with job input — result-only
 * lookup misses destinations available at enqueue time. Kept for compatibility. */
export function ctaPathForReportKind(
  kind: string,
  result: Record<string, unknown>
): string | null {
  return resolveAsyncReportDestination({ kind, result });
}
