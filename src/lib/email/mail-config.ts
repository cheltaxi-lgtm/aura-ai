/** Service mailboxes and transport settings for zovus.ru */

export type MailTransportMode = "resend" | "smtp" | "none";

export const MAIL_DOMAIN = "zovus.ru";

export const SERVICE_MAILBOXES = {
  /** Transactional: reminders, auth, joint reading */
  noreply: `noreply@${MAIL_DOMAIN}`,
  /** User-facing support */
  support: `support@${MAIL_DOMAIN}`,
  /** Privacy / 152-FZ requests */
  privacy: `privacy@${MAIL_DOMAIN}`,
  /** Legal claims and refunds */
  claims: `claims@${MAIL_DOMAIN}`,
  /** Admin alerts (new tickets, ops) */
  admin: `admin@${MAIL_DOMAIN}`,
} as const;

function env(key: string, fallback: string): string {
  const v = process.env[key]?.trim();
  return v || fallback;
}

export function getMailFromAddress(): string {
  return env("EMAIL_FROM", `Zovus <${SERVICE_MAILBOXES.noreply}>`);
}

export function getSupportEmail(): string {
  return env("MAIL_SUPPORT", SERVICE_MAILBOXES.support);
}

export function getPrivacyEmail(): string {
  return env("MAIL_PRIVACY", SERVICE_MAILBOXES.privacy);
}

export function getClaimsEmail(): string {
  return env("MAIL_CLAIMS", SERVICE_MAILBOXES.claims);
}

/** Ops inbox for support alerts — must be a real mailbox that can receive mail. */
export function getAdminNotifyEmail(): string {
  const explicit = process.env.MAIL_ADMIN_NOTIFY?.trim();
  if (explicit) return explicit;
  const seed = process.env.ADMIN_SEED_EMAIL?.trim();
  if (seed) return seed;
  return SERVICE_MAILBOXES.admin;
}

export function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://zovus.ru"
  );
}

export function isDeliverableUserEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes("@")) return false;
  return (
    !normalized.endsWith("@oauth.zovus.local") &&
    !normalized.endsWith("@telegram.zovus.local")
  );
}

/** First real mailbox: account email, then Yandex / VK / other OAuth provider emails. */
export function pickDeliverableEmail(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const normalized = raw.trim().toLowerCase();
    if (isDeliverableUserEmail(normalized)) return normalized;
  }
  return null;
}

/** Bot-offer / OAuth placeholder emails that are not real logins. */
export function isSyntheticAccountEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return (
    normalized.endsWith("@telegram.zovus.local") ||
    normalized.endsWith("@oauth.zovus.local")
  );
}

export function resolveMailTransportMode(): MailTransportMode {
  if (process.env.RESEND_API_KEY?.trim()) return "resend";
  const smtp = getSmtpConfig();
  if (smtp.host && smtp.user && smtp.pass) return "smtp";
  return "none";
}

export function getSmtpConfig() {
  return {
    host: env("SMTP_HOST", "smtp.yandex.ru"),
    port: Number.parseInt(process.env.SMTP_PORT?.trim() || "465", 10),
    secure: process.env.SMTP_SECURE !== "false",
    user: process.env.SMTP_USER?.trim() || "",
    pass: process.env.SMTP_PASS?.trim() || "",
  };
}

export function isEmailConfigured(): boolean {
  return resolveMailTransportMode() !== "none";
}

export function getEmailSetupGaps(): string[] {
  if (process.env.RESEND_API_KEY?.trim()) return [];
  const smtp = getSmtpConfig();
  const gaps: string[] = [];
  if (!smtp.host) gaps.push("SMTP_HOST");
  if (!smtp.user) gaps.push("SMTP_USER");
  if (!smtp.pass) gaps.push("SMTP_PASS");
  return gaps;
}
