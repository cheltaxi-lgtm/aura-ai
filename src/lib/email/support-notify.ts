import {
  sendAdminNotification,
  sendEmail,
  supportAutoReplyEmailHtml,
  supportNewTicketAdminEmailHtml,
  supportReplyEmailHtml,
} from "@/lib/email/send";
import { getSiteUrl } from "@/lib/email/mail-config";
import { SUPPORT_CATEGORY_LABELS, type SupportCategory } from "@/lib/support-service";

export async function emailSupportTicketCreated(params: {
  userEmail: string;
  userName: string;
  ticketId: string;
  subject: string;
  category: SupportCategory;
  messagePreview: string;
}): Promise<void> {
  const siteUrl = getSiteUrl();
  const ticketUrl = `${siteUrl}/cabinet/support`;
  const adminUrl = `${siteUrl}/admin/support`;

  void sendEmail({
    to: params.userEmail,
    subject: `Zovus — обращение принято: ${params.subject.slice(0, 80)}`,
    html: supportAutoReplyEmailHtml(params.userName, params.subject, ticketUrl),
    text: `Обращение принято: ${ticketUrl}`,
    template: "support_auto_reply",
    replyTo: undefined,
  });

  void sendAdminNotification({
    subject: `[Zovus] Новое обращение: ${params.subject.slice(0, 80)}`,
    html: supportNewTicketAdminEmailHtml({
      userEmail: params.userEmail,
      userName: params.userName,
      subject: params.subject,
      category: SUPPORT_CATEGORY_LABELS[params.category] ?? params.category,
      preview: params.messagePreview,
      adminUrl,
    }),
    text: `Новое обращение от ${params.userEmail}: ${params.subject}`,
    template: "support_admin_new",
  });
}

export async function emailSupportReplyToUser(params: {
  userEmail: string;
  userName: string;
  ticketId: string;
  subject: string;
  replyPreview: string;
}): Promise<void> {
  const ticketUrl = `${getSiteUrl()}/cabinet/support`;
  void sendEmail({
    to: params.userEmail,
    subject: `Zovus — ответ поддержки: ${params.subject.slice(0, 80)}`,
    html: supportReplyEmailHtml({
      name: params.userName,
      subject: params.subject,
      preview: params.replyPreview,
      ticketUrl,
    }),
    text: `Ответ поддержки: ${ticketUrl}`,
    template: "support_reply",
  });
}
