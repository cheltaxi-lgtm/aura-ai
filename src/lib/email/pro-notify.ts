import {
  sendAdminNotification,
  sendEmail,
  proApplyAdminEmailHtml,
  proApplyUserEmailHtml,
  proApprovedEmailHtml,
} from "@/lib/email/send";
import { getSiteUrl, isDeliverableUserEmail } from "@/lib/email/mail-config";
import { query } from "@/lib/db";

async function getProfileContact(
  profileUserId: string
): Promise<{ name: string; email: string | null }> {
  const res = await query<{ name: string | null; email: string | null }>(
    `SELECT u.name, ua.email
     FROM users u
     LEFT JOIN user_accounts ua ON ua.profile_user_id = u.id
     WHERE u.id = $1
     LIMIT 1`,
    [profileUserId]
  );
  return {
    name: res.rows[0]?.name?.trim() || "друг",
    email: res.rows[0]?.email ?? null,
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
