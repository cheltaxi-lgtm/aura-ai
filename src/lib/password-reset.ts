import { createHash, randomBytes } from "crypto";
import { query } from "@/lib/db";
import { findUserByEmail } from "@/lib/accounts";
import { hashPassword } from "@/lib/auth";
import {
  passwordResetEmailHtml,
  passwordChangedEmailHtml,
  sendEmail,
} from "@/lib/email/send";
import { getSiteUrl, isDeliverableUserEmail } from "@/lib/email/mail-config";

const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const user = await findUserByEmail(email);
  if (!user || !isDeliverableUserEmail(user.email)) return { ok: true };

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await query(
    `UPDATE password_reset_tokens SET used_at = NOW()
     WHERE user_account_id = $1 AND used_at IS NULL`,
    [user.id]
  );

  await query(
    `INSERT INTO password_reset_tokens (user_account_id, token_hash, expires_at)
     VALUES ($1, $2, $3)`,
    [user.id, tokenHash, expiresAt.toISOString()]
  );

  const resetUrl = `${getSiteUrl()}/auth/user/reset-password?token=${encodeURIComponent(rawToken)}`;
  void sendEmail({
    to: user.email,
    subject: "Zovus — сброс пароля",
    html: passwordResetEmailHtml(user.name || user.email, resetUrl),
    text: `Сброс пароля: ${resetUrl}`,
    template: "password_reset",
  });

  return { ok: true };
}

export async function completePasswordReset(
  rawToken: string,
  newPassword: string
): Promise<{ ok: boolean; error?: string }> {
  const tokenHash = hashToken(rawToken.trim());
  const res = await query<{
    id: string;
    user_account_id: string;
    expires_at: Date;
    used_at: Date | null;
  }>(
    `SELECT id, user_account_id, expires_at, used_at FROM password_reset_tokens
     WHERE token_hash = $1 LIMIT 1`,
    [tokenHash]
  );
  const row = res.rows[0];
  if (!row || row.used_at) return { ok: false, error: "invalid_token" };
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, error: "expired" };
  }

  const passwordHash = await hashPassword(newPassword);
  await query(`UPDATE user_accounts SET password_hash = $2 WHERE id = $1`, [
    row.user_account_id,
    passwordHash,
  ]);
  await query(`UPDATE password_reset_tokens SET used_at = NOW() WHERE id = $1`, [row.id]);

  const accountRes = await query<{ email: string; name: string }>(
    `SELECT email, name FROM user_accounts WHERE id = $1 LIMIT 1`,
    [row.user_account_id]
  );
  const account = accountRes.rows[0];
  if (account && isDeliverableUserEmail(account.email)) {
    void sendEmail({
      to: account.email,
      subject: "Zovus — пароль изменён",
      html: passwordChangedEmailHtml(account.name || account.email),
      text: "Пароль вашего аккаунта Zovus был изменён.",
      template: "password_changed",
    });
  }

  return { ok: true };
}
