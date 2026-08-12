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

export function welcomeEmailHtml(name: string, opts?: { needsOnboarding?: boolean }): string {
  const siteUrl = getSiteUrl();
  const safeName = name.trim() || "друг";
  const needsOnboarding = opts?.needsOnboarding === true;
  const ctaUrl = needsOnboarding
    ? `${siteUrl}/?step=onboarding&welcome=1`
    : `${siteUrl}/?app=1`;
  const ctaLabel = needsOnboarding ? "Завершить регистрацию" : "Начать расклад";
  const extra = needsOnboarding
    ? `<p style="font-size:14px;color:#555">Остался один шаг — укажите дату рождения, чтобы открыть карты судьбы и личный кабинет.</p>`
    : `<p style="font-size:14px;color:#555">Сохраните это письмо — здесь всегда можно вернуться на сайт.</p>`;
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Добро пожаловать в ${BRAND_NAME} — ваш приватный салон: таро, руны, наставники и расклады на каждый день.</p>
     ${cta(ctaUrl, ctaLabel)}
     ${extra}`,
    `Регистрация в ${BRAND_NAME}. Если вы не создавали аккаунт — проигнорируйте письмо.`
  );
}

export function memoryChoiceEnabledEmailHtml(name: string, siteUrl?: string): string {
  const url = siteUrl || getSiteUrl();
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Персональная память включена. Следующие консультации смогут учитывать только активные сведения, которые относятся к вашему новому вопросу.</p>
     <p style="font-size:14px;color:#555">В кабинете можно проверить и исправить сведения, начать отдельный свежий сеанс без памяти или в любой момент отключить и очистить её.</p>
     ${cta(`${url}/cabinet`, "Управлять памятью")}
     <p style="font-size:13px"><a href="${url}/about/personal-memory" style="color:#8b6914">Как работает персональная память</a></p>`,
    `Служебное подтверждение выбора персональной памяти в ${BRAND_NAME}.`
  );
}

export function memoryChoiceDisabledEmailHtml(name: string, siteUrl?: string): string {
  const url = siteUrl || getSiteUrl();
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Персональная память отключена. Новые консультации не будут использовать сохранённые сведения о вашем жизненном контексте.</p>
     <p style="font-size:14px;color:#555">История сеансов управляется отдельно. Если вы захотите вернуть последовательный контекст, выбор можно изменить в кабинете.</p>
     ${cta(`${url}/cabinet`, "Открыть настройки памяти")}
     <p style="font-size:13px"><a href="${url}/about/personal-memory" style="color:#8b6914">Подробнее о памяти</a></p>`,
    `Служебное подтверждение выбора персональной памяти в ${BRAND_NAME}.`
  );
}

export function passwordChangedEmailHtml(name: string): string {
  const siteUrl = getSiteUrl();
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Пароль для вашего аккаунта ${BRAND_NAME} успешно изменён.</p>
     <p style="font-size:14px;color:#555">Если это были не вы — срочно напишите в поддержку: ${getSupportEmail()}.</p>
     ${cta(`${siteUrl}/auth/user/login`, "Войти в аккаунт")}`,
    "Служебное уведомление о смене пароля."
  );
}

export function dailyReminderEmailHtml(name: string, siteUrl?: string): string {
  const url = siteUrl || getSiteUrl();
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Новый день — новая энергия. <strong>Бесплатный</strong> расклад на сутки ждёт вас — узнайте, что несёт сегодняшний день.</p>
     ${cta(`${url}/?dailyCards=1`, "Открыть карты дня бесплатно")}`,
    "Напоминание можно отключить в профиле Zovus."
  );
}

export function dailyBonusReminderEmailHtml(
  name: string,
  bonusAmount: number,
  siteUrl?: string
): string {
  const url = siteUrl || getSiteUrl();
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Ваш ежедневный бонус готов: <strong>${bonusAmount} рун</strong> можно забрать бесплатно в личном кабинете.</p>
     <p style="font-size:14px;color:#555">Руны — валюта для раскладов с мастерами. Не пропустите сегодняшний подарок.</p>
     ${cta(`${url}/cabinet`, `Забрать ${bonusAmount} рун`)}`,
    "Напоминание о бонусе можно отключить в профиле Zovus."
  );
}

export function inactiveUserEmailHtml(
  name: string,
  inactiveDays: number,
  siteUrl?: string
): string {
  const url = siteUrl || getSiteUrl();
  const safeName = name.trim() || "друг";
  const body =
    inactiveDays <= 7
      ? `<p>Вы давно не заходили — а карты уже готовы к <strong>бесплатному</strong> раскладу на сегодня.</p>
         <p style="font-size:14px;color:#555">Один клик — и вы снова в потоке: суточный расклад, бонусные руны и ваши сохранённые сессии.</p>`
      : `<p>Мы скучаем! Прошло уже две недели — за это время накопилось много нового: расклады, бонусы и персональные разборы.</p>
         <p style="font-size:14px;color:#555">Вернитесь на минуту: бесплатный расклад на сутки и ежедневные руны ждут вас.</p>`;
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     ${body}
     ${cta(`${url}/?daily=1`, "Вернуться на Zovus")}`,
    `Вы согласились на рассылку Zovus. Отписаться можно в профиле или написав на ${getSupportEmail()}.`
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
    `<p>Оба расклада собраны — ваша общая интерпретация уже готова.</p>`,
    ctaUrl,
    "Читать результат"
  );
}

export function jointReadingExpiringEmailHtml(name: string, ctaUrl: string): string {
  return jointReadingEmailShell(
    name,
    `<p>Ваше приглашение на совместный расклад скоро истечёт, а партнёр пока не прошёл свою часть. Отправьте ему ссылку ещё раз, пока приглашение действует.</p>`,
    ctaUrl,
    "Открыть приглашение"
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

export function partnerLeadAdminEmailHtml(params: {
  contactName: string;
  phone: string;
  email: string;
  company: string;
  website: string | null;
  preview: string;
  adminUrl: string;
}): string {
  const websiteLine = params.website
    ? `<li><strong>Сайт:</strong> ${params.website.slice(0, 200)}</li>`
    : "";
  return shell(
    `<p>Новая заявка на партнёрство ${BRAND_NAME}.</p>
     <ul style="font-size:14px;line-height:1.7">
       <li><strong>Имя:</strong> ${params.contactName.slice(0, 120)}</li>
       <li><strong>Телефон:</strong> ${params.phone.slice(0, 40)}</li>
       <li><strong>Email:</strong> ${params.email.slice(0, 200)}</li>
       <li><strong>Компания:</strong> ${params.company.slice(0, 200)}</li>
       ${websiteLine}
     </ul>
     <p style="font-size:14px;color:#444">${params.preview.slice(0, 600).replace(/\n/g, "<br/>")}</p>
     ${cta(params.adminUrl, "Открыть в админке")}`,
    "Уведомление о партнёрской заявке."
  );
}

export function proApplyAdminEmailHtml(params: {
  displayName: string;
  email: string;
  status: string;
  adminUrl: string;
}): string {
  return shell(
    `<p>Новая заявка в Zovus Pro.</p>
     <ul style="font-size:14px;line-height:1.7">
       <li><strong>Имя:</strong> ${params.displayName.slice(0, 120)}</li>
       <li><strong>Email:</strong> ${params.email.slice(0, 200)}</li>
       <li><strong>Статус:</strong> ${params.status.slice(0, 40)}</li>
     </ul>
     ${cta(params.adminUrl, "Открыть в админке")}`,
    "Уведомление о заявке практика."
  );
}

export function proApplyUserEmailHtml(name: string, proUrl: string): string {
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Мы получили вашу заявку в Zovus Pro. После проверки откроем кабинет практика.</p>
     ${cta(proUrl, "Открыть Pro")}`,
    "Заявка в Zovus Pro."
  );
}

export function proApprovedEmailHtml(name: string, proUrl: string): string {
  const safeName = name.trim() || "друг";
  return shell(
    `<p>Здравствуйте, ${safeName}!</p>
     <p>Доступ к Zovus Pro открыт. Можно вести клиентов, кейсы и выдавать отчёты.</p>
     ${cta(proUrl, "Перейти в кабинет")}`,
    "Одобрение доступа Zovus Pro."
  );
}
