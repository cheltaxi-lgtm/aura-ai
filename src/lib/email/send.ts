/**
 * Outbound email — Resend API when RESEND_API_KEY is set, otherwise no-op log.
 */
export interface SendEmailParams {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "Zovus <noreply@zovus.ru>";

  if (!apiKey) {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email] skip (no RESEND_API_KEY):", params.to, params.subject);
    }
    return false;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [params.to],
        subject: params.subject,
        html: params.html,
        text: params.text,
      }),
    });
    if (!res.ok) {
      console.warn("[email] Resend error:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[email] send failed:", err);
    return false;
  }
}

export function dailyReminderEmailHtml(name: string, siteUrl: string): string {
  const safeName = name.trim() || "друг";
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
      <p>Здравствуйте, ${safeName}!</p>
      <p>Новый день — новая энергия. Откройте расклад на сутки в Zovus и узнайте, что несёт сегодняшний день.</p>
      <p><a href="${siteUrl}/?daily=1" style="display:inline-block;padding:12px 20px;background:#c9993a;color:#1a0f00;text-decoration:none;border-radius:8px;font-weight:600">Открыть карты дня</a></p>
      <p style="color:#666;font-size:12px">Вы получили это письмо, потому что включили напоминания в Zovus. Отключить можно в профиле.</p>
    </div>
  `.trim();
}

function jointReadingEmailShell(name: string, bodyHtml: string, ctaUrl: string, ctaLabel: string): string {
  const safeName = name.trim() || "друг";
  return `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#1a1a2e">
      <p>Здравствуйте, ${safeName}!</p>
      ${bodyHtml}
      <p><a href="${ctaUrl}" style="display:inline-block;padding:12px 20px;background:#c9993a;color:#1a0f00;text-decoration:none;border-radius:8px;font-weight:600">${ctaLabel}</a></p>
      <p style="color:#666;font-size:12px">Письмо о совместном раскладе Zovus, на который вы согласились. Отключить можно в профиле.</p>
    </div>
  `.trim();
}

export function jointReadingPartnerDoneEmailHtml(name: string, ctaUrl: string): string {
  return jointReadingEmailShell(
    name,
    `<p>Ваш партнёр прошёл свою часть совместного расклада. Как только вы завершите свою — соберём общую интерпретацию для вас двоих.</p>`,
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
