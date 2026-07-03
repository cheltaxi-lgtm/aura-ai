import {
  getMailFromAddress,
  getSmtpConfig,
  resolveMailTransportMode,
  type MailTransportMode,
} from "@/lib/email/mail-config";

export interface RawEmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
}

async function sendViaResend(payload: RawEmailPayload, from: string): Promise<{ ok: boolean; error?: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return { ok: false, error: "no_resend_key" };

  try {
    const body: Record<string, unknown> = {
      from,
      to: [payload.to],
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
    };
    if (payload.replyTo) body.reply_to = payload.replyTo;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      return { ok: false, error: `resend_${res.status}:${await res.text().catch(() => "")}` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "resend_exception" };
  }
}

async function sendViaSmtp(payload: RawEmailPayload, from: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = getSmtpConfig();
  if (!cfg.user || !cfg.pass) return { ok: false, error: "smtp_incomplete" };

  try {
    const nodemailer = await import("nodemailer");
    const transport = nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass },
    });

    await transport.sendMail({
      from,
      to: payload.to,
      subject: payload.subject,
      html: payload.html,
      text: payload.text,
      replyTo: payload.replyTo,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "smtp_exception" };
  }
}

export async function deliverEmail(
  payload: RawEmailPayload,
  preferred?: MailTransportMode
): Promise<{ ok: boolean; provider: MailTransportMode | "none"; error?: string }> {
  const from = getMailFromAddress();
  const mode = preferred && preferred !== "none" ? preferred : resolveMailTransportMode();

  if (mode === "none") {
    if (process.env.NODE_ENV !== "production") {
      console.info("[email] skip (no transport):", payload.to, payload.subject);
    }
    return { ok: false, provider: "none", error: "not_configured" };
  }

  const result =
    mode === "smtp" ? await sendViaSmtp(payload, from) : await sendViaResend(payload, from);

  if (!result.ok && mode === "resend" && getSmtpConfig().user) {
    const fallback = await sendViaSmtp(payload, from);
    if (fallback.ok) return { ok: true, provider: "smtp" };
  }

  return { ok: result.ok, provider: mode, error: result.error };
}

export function getEmailTransportStatus() {
  const mode = resolveMailTransportMode();
  const smtp = getSmtpConfig();
  return {
    mode,
    configured: mode !== "none",
    from: getMailFromAddress(),
    smtpHost: smtp.host,
    smtpUserSet: Boolean(smtp.user),
    resendKeySet: Boolean(process.env.RESEND_API_KEY?.trim()),
  };
}
