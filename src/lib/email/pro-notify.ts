import {
  sendAdminNotification,
  sendEmail,
  proApplyAdminEmailHtml,
  proApplyUserEmailHtml,
  proApprovedEmailHtml,
} from "@/lib/email/send";
import {
  getSiteUrl,
  isDeliverableUserEmail,
  pickDeliverableEmail,
} from "@/lib/email/mail-config";
import { ACCOUNT_DELIVERABLE_EMAIL_SQL } from "@/lib/reminder-contacts";
import { query } from "@/lib/db";

async function getProfileContact(
  profileUserId: string
): Promise<{ name: string; email: string | null }> {
  const res = await query<{ name: string | null; deliverable_email: string | null }>(
    `SELECT u.name, (${ACCOUNT_DELIVERABLE_EMAIL_SQL}) AS deliverable_email
     FROM users u
     LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [profileUserId]
  );
  return {
    name: res.rows[0]?.name?.trim() || "друг",
    email: pickDeliverableEmail(res.rows[0]?.deliverable_email),
  };
}

/** Best-effort: admin alert + user confirmation after Pro apply. */
export async function notifyProAccountApplied(params: {
  profileUserId: string;
  accountId: string;
  displayName: string | null;
  status: string;
  created: boolean;
}): Promise<void> {
  if (!params.created) return;

  const { name, email } = await getProfileContact(params.profileUserId);
  const adminUrl = `${getSiteUrl()}/admin/pro`;
  const proUrl = `${getSiteUrl()}/pro`;

  void sendAdminNotification({
    subject: `[Zovus Pro] Заявка: ${(params.displayName || name).slice(0, 80)}`,
    html: proApplyAdminEmailHtml({
      displayName: params.displayName || name,
      email: email || "—",
      status: params.status,
      adminUrl,
    }),
    text: `Pro apply: ${params.displayName || name} / ${email || "—"} / ${params.status}`,
    template: "pro_apply_admin",
  });

  if (email && isDeliverableUserEmail(email)) {
    void sendEmail({
      to: email,
      subject:
        params.status === "active"
          ? "Zovus Pro — доступ открыт"
          : "Zovus Pro — заявка принята",
      html:
        params.status === "active"
          ? proApprovedEmailHtml(name, proUrl)
          : proApplyUserEmailHtml(name, proUrl),
      text:
        params.status === "active"
          ? `Доступ к Zovus Pro открыт: ${proUrl}`
          : `Заявка в Zovus Pro принята: ${proUrl}`,
      template: params.status === "active" ? "pro_approved" : "pro_apply_user",
    });
  }
}

/** Best-effort: email practitioner when admin sets status=active. */
export async function notifyProAccountApproved(params: {
  profileUserId: string;
  displayName: string | null;
}): Promise<void> {
  const { name, email } = await getProfileContact(params.profileUserId);
  if (!email || !isDeliverableUserEmail(email)) return;
  const proUrl = `${getSiteUrl()}/pro`;
  void sendEmail({
    to: email,
    subject: "Zovus Pro — доступ открыт",
    html: proApprovedEmailHtml(params.displayName || name, proUrl),
    text: `Доступ к Zovus Pro открыт: ${proUrl}`,
    template: "pro_approved",
  });
}

export function proEventEmailHtml(params: {
  title: string;
  lead: string;
  ctaUrl: string;
  ctaLabel: string;
}): string {
  return `<!doctype html><html><body style="background:#0b0b10;color:#ede6da;font-family:system-ui,sans-serif;padding:24px">
  <div style="max-width:520px;margin:0 auto;border:1px solid #c9a24a44;border-radius:16px;padding:24px">
    <p style="color:#c9a24a;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:0 0 8px">Zovus Pro</p>
    <h1 style="font-size:20px;margin:0 0 12px">${params.title}</h1>
    <p style="font-size:14px;color:#b8b0a0;margin:0 0 20px">${params.lead}</p>
    <a href="${params.ctaUrl}" style="display:inline-block;background:#c9a24a;color:#0b0b10;text-decoration:none;font-size:14px;font-weight:600;padding:10px 20px;border-radius:10px">${params.ctaLabel}</a>
  </div>
</body></html>`;
}

/** Best-effort: practitioner gets mail when a client submits the intake form. */
export async function notifyProIntakeSubmitted(params: {
  profileUserId: string;
  alias: string;
  caseId: string;
}): Promise<void> {
  const { email } = await getProfileContact(params.profileUserId);
  if (!email || !isDeliverableUserEmail(email)) return;
  const caseUrl = `${getSiteUrl()}/pro/case/${params.caseId}`;
  const alias = params.alias.slice(0, 80);
  void sendEmail({
    to: email,
    subject: `[Zovus Pro] Новая анкета: ${alias}`,
    html: proEventEmailHtml({
      title: "Новая анкета клиента",
      lead: `${alias} заполнил(а) бриф — кейс уже создан и ждёт ваших данных.`,
      ctaUrl: caseUrl,
      ctaLabel: "Открыть кейс",
    }),
    text: `Новая анкета: ${alias}. Кейс: ${caseUrl}`,
    template: "pro_intake_submitted",
  });
}

/** Best-effort: practitioner gets mail when a client asks on a delivered report. */
export async function notifyProClientQuestion(params: {
  profileUserId: string;
  caseId: string;
  questionPreview: string;
}): Promise<void> {
  const { email } = await getProfileContact(params.profileUserId);
  if (!email || !isDeliverableUserEmail(email)) return;
  const inboxUrl = `${getSiteUrl()}/pro/inbox`;
  const preview = params.questionPreview.slice(0, 140);
  void sendEmail({
    to: email,
    subject: "[Zovus Pro] Вопрос клиента по отчёту",
    html: proEventEmailHtml({
      title: "Вопрос по отчёту",
      lead: `«${preview}» — черновик ответа ждёт утверждения во входящих.`,
      ctaUrl: inboxUrl,
      ctaLabel: "Открыть входящие",
    }),
    text: `Вопрос клиента: ${preview}. Входящие: ${inboxUrl}`,
    template: "pro_client_question",
  });
}

/** Best-effort + priority subject: crisis escalation from a client dialog. */
export async function notifyProCrisisEscalation(params: {
  profileUserId: string;
  caseId: string;
}): Promise<void> {
  const { email } = await getProfileContact(params.profileUserId);
  if (!email || !isDeliverableUserEmail(email)) return;
  const inboxUrl = `${getSiteUrl()}/pro/inbox`;
  void sendEmail({
    to: email,
    subject: "[Zovus Pro] СРОЧНО: эскалация от клиента",
    html: proEventEmailHtml({
      title: "Эскалация безопасности",
      lead: "Клиент прислал тревожное сообщение — диалог переведён в ручной режим. Ответьте лично как можно скорее.",
      ctaUrl: inboxUrl,
      ctaLabel: "Открыть входящие",
    }),
    text: `Эскалация от клиента по кейсу #${params.caseId}. Входящие: ${inboxUrl}`,
    template: "pro_crisis_escalation",
  });
}
