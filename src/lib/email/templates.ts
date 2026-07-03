import { BRAND_NAME } from "@/lib/brand";
import { getSiteUrl, getSupportEmail } from "@/lib/email/mail-config";

function shell(bodyHtml: string, footerNote?: string): string {
  const note =
    footerNote ??
    `Вы получили это письмо от ${BRAND_NAME}. Вопросы — ${getSupportEmail()}.`;
  return `
    <div style="font-family:Georgia,'Times New Roman',serif;max-width:560px;margin:0 auto;color:#1a1a2e;line-height:1.55">
      <div style="padding:8px 0 20px;border-bottom:1px solid #e8dcc0;margin-bottom:20px">
        <span style="font-size:22px;font-weight:700;letter-spacing:0.18em;color:#8b6914">${BRAND_NAME.toUpperCase()}</span>
      </div>
      ${bodyHtml}
      <p style="color:#888;font-size:12px;margin-top:28px;border-top:1px solid #eee;padding-top:16px">${note}</p>
    </div>
  `.trim();
}

function cta(href: string, label: string): string {
  return `<p style="margin:24px 0"><a href="${href}" style="display:inline-block;padding:12px 22px;background:#c9993a;color:#1a0f00;text-decoration:none;border-radius:8px;font-weight:600;font-family:sans-serif">${label}</a></p>`;
}

export function welcomeEmailHtml(name: string): string {
  const siteUrl = getSiteUrl();
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Добро пожаловать в ${BRAND_NAME} — ваш персональный оракул: таро, руны, мастера и расклады на каждый день.</p>
     ${cta(`${siteUrl}/?app=1`, "Начать расклад")}
     <p style="font-size:14px;color:#555">Сохраните это письмо — здесь всегда можно вернуться на сайт.</p>`,
    `Регистрация в ${BRAND_NAME}. Если вы не создавали аккаунт — проигнорируйте письмо.`
  );
}

export function dailyReminderEmailHtml(name: string, siteUrl?: string): string {
  const url = siteUrl || getSiteUrl();
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Новый день — новая энергия. Откройте расклад на сутки и узнайте, что несёт сегодняшний день.</p>
     ${cta(`${url}/?daily=1`, "Открыть карты дня")}`,
    "Напоминание можно отключить в профиле Zovus."
  );
}

function jointReadingEmailShell(name: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     ${bodyHtml}
     ${cta(ctaUrl, ctaLabel)}`,
    "Письмо о совместном раскладе Zovus. Отключить email-напоминания можно в профиле."
  );
}

export function jointReadingPartnerDoneEmailHtml(name: string, ctaUrl: string): string {
  return jointReadingEmailShell(
    name,
    `<p>Ваш партнёр прошёл свою часть совместного расклада. Завершите свою — и мы соберём общую интерпретацию.</p>`,
    ctaUrl,
    "Пройти свой расклад"
  );
}

export function jointReadingCompletedEmailHtml(name: string, ctaUrl: string): string {
  return jointReadingEmailShell(
    name,
    `<p>Оба расклада собраны — общая интерпретация вашей пары уже готова.</p>`,
    ctaUrl,
    "Читать результат"
  );
}

export function passwordResetEmailHtml(name: string, resetUrl: string): string {
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Мы получили запрос на сброс пароля для вашего аккаунта ${BRAND_NAME}. Ссылка действует 1 час.</p>
     ${cta(resetUrl, "Сбросить пароль")}
     <p style="font-size:14px;color:#555">Если вы не запрашивали сброс — просто удалите это письмо. Пароль не изменится.</p>`,
    "Служебное письмо для восстановления доступа."
  );
}

export function supportReplyEmailHtml(params: {
  name: string;
  subject: string;
  preview: string;
  ticketUrl: string;
}): string {
  const safeName = params.name.trim() || "друг";
  const preview = params.preview.slice(0, 400).replace(/\n/g, "<br/>");
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Поддержка ответила по обращению «${params.subject.slice(0, 120)}»:</p>
     <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #c9993a;background:#faf6ee;color:#333;font-size:14px">${preview}</blockquote>
     ${cta(params.ticketUrl, "Открыть обращение")}`
  );
}

export function supportNewTicketAdminEmailHtml(params: {
  userEmail: string;
  userName: string;
  subject: string;
  category: string;
  preview: string;
  adminUrl: string;
}): string {
  return shell(
    `<p>Новое обращение в поддержку ${BRAND_NAME}.</p>
     <ul style="font-size:14px;line-height:1.7">
       <li><strong>Пользователь:</strong> ${params.userName} (${params.userEmail})</li>
       <li><strong>Тема:</strong> ${params.subject.slice(0, 200)}</li>
       <li><strong>Категория:</strong> ${params.category}</li>
     </ul>
     <p style="font-size:14px;color:#444">${params.preview.slice(0, 600).replace(/\n/g, "<br/>")}</p>
     ${cta(params.adminUrl, "Открыть в админке")}`,
    "Уведомление для команды поддержки."
  );
}

export function supportAutoReplyEmailHtml(name: string, subject: string, ticketUrl: string): string {
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Ваше обращение «${subject.slice(0, 120)}» принято. Мы ответим в ближайшее рабочее время.</p>
     ${cta(ticketUrl, "Открыть обращение")}`
  );
}
