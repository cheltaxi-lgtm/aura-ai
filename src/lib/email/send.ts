import { deliverEmail } from "@/lib/email/transport";
import { logEmailAttempt } from "@/lib/email/log";
import {
  getAdminNotifyEmail,
  getSiteUrl,
  getSupportEmail,
} from "@/lib/email/mail-config";

const SUPPORT_REPLY = () => getSupportEmail();

export type { SendEmailParams } from "@/lib/email/types";

export {
  dailyReminderEmailHtml,
  dailyBonusReminderEmailHtml,
  inactiveUserEmailHtml,
  inactiveUserEmailText,
  inactiveWinbackCtaUrl,
  welcomeEmailHtml,
  passwordResetEmailHtml,
  passwordChangedEmailHtml,
  jointReadingPartnerDoneEmailHtml,
  jointReadingCompletedEmailHtml,
  jointReadingExpiringEmailHtml,
  memoryChoiceEnabledEmailHtml,
  memoryChoiceDisabledEmailHtml,
  supportReplyEmailHtml,
  supportNewTicketAdminEmailHtml,
  supportAutoReplyEmailHtml,
  partnerLeadAdminEmailHtml,
  proApplyAdminEmailHtml,
  proApplyUserEmailHtml,
  proApprovedEmailHtml,
} from "@/lib/email/templates";

import type { SendEmailParams } from "@/lib/email/types";
import { isDeliverableUserEmail } from "@/lib/email/mail-config";
import {
  memoryChoiceDisabledEmailHtml,
  memoryChoiceEnabledEmailHtml,
  welcomeEmailHtml,
} from "@/lib/email/templates";

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
    listUnsubscribeUrl: params.listUnsubscribeUrl,
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

/** Transactional confirmation helper; the preferences route must call this after a saved choice. */
export async function sendMemoryChoiceEmail(params: {
  to: string;
  name: string;
  choice: "enabled" | "disabled";
}): Promise<boolean> {
  if (!isDeliverableUserEmail(params.to)) return false;
  const enabled = params.choice === "enabled";
  return sendEmail({
    to: params.to,
    subject: enabled
      ? "Zovus — персональная память включена"
      : "Zovus — персональная память отключена",
    html: enabled
      ? memoryChoiceEnabledEmailHtml(params.name || params.to)
      : memoryChoiceDisabledEmailHtml(params.name || params.to),
    text: enabled
      ? `Персональная память включена. Управление: ${getSiteUrl()}/cabinet`
      : `Персональная память отключена. Настройки: ${getSiteUrl()}/cabinet`,
    template: enabled ? "memory_choice_enabled" : "memory_choice_disabled",
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
