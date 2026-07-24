import { sendAdminNotification, partnerLeadAdminEmailHtml } from "@/lib/email/send";
import { getSiteUrl } from "@/lib/email/mail-config";

export async function emailPartnerLeadCreated(params: {
  leadId: string;
  contactName: string;
  phone: string;
  email: string;
  company: string;
  website: string | null;
  messagePreview: string;
}): Promise<void> {
  const adminUrl = `${getSiteUrl()}/admin/partners?lead=${encodeURIComponent(params.leadId)}`;

  void sendAdminNotification({
    subject: `[Zovus] Партнёрство: ${params.company.slice(0, 80)}`,
    html: partnerLeadAdminEmailHtml({
      contactName: params.contactName,
      phone: params.phone,
      email: params.email,
      company: params.company,
      website: params.website,
      preview: params.messagePreview,
      adminUrl,
    }),
    text: `Партнёрство: ${params.company} / ${params.contactName} / ${params.phone} / ${params.email}`,
    template: "partner_lead_admin",
  });
}
