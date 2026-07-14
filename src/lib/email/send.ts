import { deliverEmail } from "@/lib/email/transport";
import { logEmailAttempt } from "@/lib/email/log";
import { getAdminNotifyEmail, getSupportEmail } from "@/lib/email/mail-config";

const SUPPORT_REPLY = () => getSupportEmail();

export type { SendEmailParams } from "@/lib/email/types";

export {
  dailyReminderEmailHtml,
  dailyBonusReminderEmailHtml,
  inactiveUserEmailHtml,
  welcomeEmailHtml,
  passwordResetEmailHtml,
  passwordChangedEmailHtml,
  jointReadingPartnerDoneEmailHtml,
  jointReadingCompletedEmailHtml,
  jointReadingExpiringEmailHtml,
  supportReplyEmailHtml,
  supportNewTicketAdminEmailHtml,
  supportAutoReplyEmailHtml,
} from "@/lib/email/templates";

import type { SendEmailParams } from "@/lib/email/types";
import { isDeliverableUserEmail } from "@/lib/email/mail-config";
import { welcomeEmailHtml } from "@/lib/email/templates";

export async function sendEmail(
  params: SendEmailParams & { template?: string; replyTo?: string }
): Promise<boolean> {
  const template = params.template ?? "generic";
  const result = await deliverEmail({
    to: params.to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: params.replyTo ?? SUPPORT_REPLY(),
  });

  await logEmailAttempt({
    recipient: params.to,
    subject: params.subject,
    template,
    provider: result.provider === "none" ? null : result.provider,
    status: result.ok ? "sent" : result.error === "not_configured" ? "skipped" : "failed",
    errorMessage: result.error,
  });

  return result.ok;
}

export async function sendWelcomeEmail(
  to: string,
  name: string,
  opts?: { needsOnboarding?: boolean }
): Promise<boolean> {
  if (!isDeliverableUserEmail(to)) return false;
  return sendEmail({
    to,
    subject: "Добро пожаловать в Zovus",
    html: welcomeEmailHtml(name || to, opts),
    text: opts?.needsOnboarding
      ? "Добро пожаловать в Zovus — завершите регистрацию на zovus.ru"
      : "Добро пожаловать в Zovus — откройте расклад на zovus.ru",
    template: "welcome",
  });
}

/** Alert ops inbox about a new support ticket. */
export async function sendAdminNotification(params: {
  subject: string;
  html: string;
  text?: string;
  template: string;
}): Promise<boolean> {
  const to = getAdminNotifyEmail();
  if (!to) return false;

  const result = await deliverEmail({
    to,
    subject: params.subject,
    html: params.html,
    text: params.text,
    replyTo: getSupportEmail(),
  });

  await logEmailAttempt({
    recipient: to,
    subject: params.subject,
    template: params.template,
    provider: result.provider === "none" ? null : result.provider,
    status: result.ok ? "sent" : result.error === "not_configured" ? "skipped" : "failed",
    errorMessage: result.error,
    meta: { kind: "admin_notify" },
  });

  return result.ok;
}

export { getEmailTransportStatus } from "@/lib/email/transport";
export {
  isEmailConfigured,
  getEmailSetupGaps,
  getSupportEmail,
  SERVICE_MAILBOXES,
} from "@/lib/email/mail-config";
