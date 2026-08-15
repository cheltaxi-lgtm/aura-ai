import { DAILY_BONUS_AMOUNT } from "@/lib/rune-daily-constants";
import { getSiteUrl } from "@/lib/email/mail-config";
import {
  dailyBonusReminderEmailHtml,
  dailyReminderEmailHtml,
  inactiveUserEmailHtml,
  jointReadingCompletedEmailHtml,
  jointReadingExpiringEmailHtml,
  jointReadingPartnerDoneEmailHtml,
  passwordChangedEmailHtml,
  passwordResetEmailHtml,
  supportAutoReplyEmailHtml,
  supportNewTicketAdminEmailHtml,
  supportReplyEmailHtml,
  welcomeEmailHtml,
  proApplyAdminEmailHtml,
  proApplyUserEmailHtml,
  proApprovedEmailHtml,
} from "@/lib/email/templates";

export type EmailTemplateCategory = "transactional" | "reminder" | "marketing" | "support" | "admin";

export type EmailTemplateDef = {
  id: string;
  label: string;
  category: EmailTemplateCategory;
  description: string;
  previewHtml: () => string;
  previewSubject: string;
};

const siteUrl = () => getSiteUrl();

export const EMAIL_TEMPLATE_REGISTRY: EmailTemplateDef[] = [
  {
    id: "welcome",
    label: "Приветствие после регистрации",
    category: "transactional",
    description: "Отправляется сразу после создания аккаунта.",
    previewHtml: () => welcomeEmailHtml("Анна"),
    previewSubject: "Добро пожаловать в Zovus",
  },
  {
    id: "password_reset",
    label: "Сброс пароля",
    category: "transactional",
    description: "Ссылка на восстановление доступа (1 час).",
    previewHtml: () => passwordResetEmailHtml("Анна", `${siteUrl()}/auth/reset?token=preview`),
    previewSubject: "Zovus — сброс пароля",
  },
  {
    id: "password_changed",
    label: "Пароль изменён",
    category: "transactional",
    description: "Подтверждение успешной смены пароля.",
    previewHtml: () => passwordChangedEmailHtml("Анна"),
    previewSubject: "Zovus — пароль изменён",
  },
  {
    id: "daily_reminder",
    label: "Карты дня (cron)",
    category: "reminder",
    description: "Ежедневное напоминание открыть бесплатный суточный расклад.",
    previewHtml: () => dailyReminderEmailHtml("Анна"),
    previewSubject: "Zovus — ваш расклад на сегодня",
  },
  {
    id: "daily_bonus",
    label: "Бонус рун (cron)",
    category: "reminder",
    description: "Вечернее напоминание забрать ежедневные бесплатные руны.",
    previewHtml: () => dailyBonusReminderEmailHtml("Анна", DAILY_BONUS_AMOUNT),
    previewSubject: `Zovus — ${DAILY_BONUS_AMOUNT} рун ждут вас`,
  },
  {
    id: "inactive_7d",
    label: "Win-back 7 дней",
    category: "marketing",
    description: "Пользователь не заходил 7–14 дней, marketing_consent=true.",
    previewHtml: () => inactiveUserEmailHtml("Анна", 7),
    previewSubject: "Zovus — давно не виделись",
  },
  {
    id: "inactive_14d",
    label: "Win-back 14 дней",
    category: "marketing",
    description: "Пользователь не заходил 14+ дней, marketing_consent=true.",
    previewHtml: () => inactiveUserEmailHtml("Анна", 14),
    previewSubject: "Zovus — ваш Zovus остаётся с Вами",
  },
  {
    id: "joint_reading_partner",
    label: "Совместный расклад — партнёр готов",
    category: "reminder",
    description: "Партнёр завершил свою часть совместного расклада.",
    previewHtml: () =>
      jointReadingPartnerDoneEmailHtml("Анна", `${siteUrl()}/joint-reading/preview`),
    previewSubject: "Zovus — партнёр завершил расклад",
  },
  {
    id: "joint_reading_done",
    label: "Совместный расклад — готово",
    category: "reminder",
    description: "Оба участника прошли расклад, результат доступен.",
    previewHtml: () =>
      jointReadingCompletedEmailHtml("Анна", `${siteUrl()}/joint-reading/preview`),
    previewSubject: "Zovus — совместный расклад готов",
  },
  {
    id: "joint_reading_expiring",
    label: "Совместный расклад — истекает",
    category: "reminder",
    description: "Приглашение скоро истечёт, партнёр не начал.",
    previewHtml: () =>
      jointReadingExpiringEmailHtml("Анна", `${siteUrl()}/joint-reading/preview`),
    previewSubject: "Zovus — приглашение истекает",
  },
  {
    id: "support_auto_reply",
    label: "Поддержка — автоответ",
    category: "support",
    description: "Подтверждение получения обращения пользователю.",
    previewHtml: () =>
      supportAutoReplyEmailHtml("Анна", "Вопрос по оплате", `${siteUrl()}/support/preview`),
    previewSubject: "Zovus — обращение принято",
  },
  {
    id: "support_admin_new",
    label: "Поддержка — алерт админу",
    category: "admin",
    description: "Новое обращение в поддержку для команды.",
    previewHtml: () =>
      supportNewTicketAdminEmailHtml({
        userEmail: "user@example.com",
        userName: "Анна",
        subject: "Вопрос по оплате",
        category: "billing",
        preview: "Не пришли руны после оплаты…",
        adminUrl: `${siteUrl()}/admin/support`,
      }),
    previewSubject: "Zovus — новое обращение",
  },
  {
    id: "support_reply",
    label: "Поддержка — ответ админа",
    category: "support",
    description: "Ответ поддержки по тикету пользователю.",
    previewHtml: () =>
      supportReplyEmailHtml({
        name: "Анна",
        subject: "Вопрос по оплате",
        preview: "Руны зачислены, проверьте баланс в кабинете.",
        ticketUrl: `${siteUrl()}/support/preview`,
      }),
    previewSubject: "Zovus — ответ поддержки",
  },
  {
    id: "admin_test",
    label: "Тест из админки",
    category: "admin",
    description: "Ручная проверка доставки SMTP/Resend.",
    previewHtml: () =>
      `<p>Тестовое письмо от админки Zovus (${new Date().toISOString()}).</p>`,
    previewSubject: "Zovus — тест почты",
  },
  {
    id: "pro_apply_admin",
    label: "Pro — заявка админу",
    category: "admin",
    description: "Новая заявка практика в Zovus Pro.",
    previewHtml: () =>
      proApplyAdminEmailHtml({
        displayName: "Анна",
        email: "anna@example.com",
        status: "pending",
        adminUrl: `${siteUrl()}/admin/pro`,
      }),
    previewSubject: "[Zovus Pro] Заявка: Анна",
  },
  {
    id: "pro_apply_user",
    label: "Pro — заявка принята",
    category: "transactional",
    description: "Подтверждение заявки практику (ожидание одобрения).",
    previewHtml: () => proApplyUserEmailHtml("Анна", `${siteUrl()}/pro`),
    previewSubject: "Zovus Pro — заявка принята",
  },
  {
    id: "pro_approved",
    label: "Pro — доступ открыт",
    category: "transactional",
    description: "Одобрение доступа к кабинету практика.",
    previewHtml: () => proApprovedEmailHtml("Анна", `${siteUrl()}/pro`),
    previewSubject: "Zovus Pro — доступ открыт",
  },
];

export function getTemplateById(id: string): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATE_REGISTRY.find((t) => t.id === id);
}
