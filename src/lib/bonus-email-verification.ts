import { SignJWT, jwtVerify } from "jose";
import { createHmac } from "node:crypto";
import { query, queryClient, withTransaction } from "@/lib/db";
import { getSiteUrl, isDeliverableUserEmail } from "@/lib/email/mail-config";
import { sendEmail } from "@/lib/email/send";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
function verificationSecret() {
  if (!process.env.AUTH_SECRET) throw new Error("AUTH_SECRET_required");
  // Domain-separated signing key: a mailbox proof must never be a session JWT.
  return createHmac("sha256", process.env.AUTH_SECRET).update("zovus:bonus-email:v1").digest();
}
export async function sendBonusEmailVerification(accountId: string): Promise<boolean> {
  const {rows}=await query<{email:string;token_version:number;bonus_email_verification_required:boolean}>(
    "SELECT email,token_version,bonus_email_verification_required FROM user_accounts WHERE id=$1 AND erasure_requested_at IS NULL",[accountId]);
  const account=rows[0];
  if (!account?.bonus_email_verification_required) return true;
  if (!isDeliverableUserEmail(account.email)) return false;
  const token=await new SignJWT({purpose:"bonus-email",email:account.email,tv:account.token_version})
    .setProtectedHeader({alg:"HS256"}).setAudience("bonus-email").setSubject(accountId).setIssuedAt().setExpirationTime("24h").sign(verificationSecret());
  // Fragment keeps the bearer token out of access logs and link previews.
  const url=`${getSiteUrl()}/auth/user/verify-email#token=${encodeURIComponent(token)}`;
  return sendEmail({to:account.email,subject:"Zovus — подтвердите почту для получения рун",
    text:`Подтвердите почту в аккаунте, в котором вы зарегистрировались: ${url}\nСсылка действует 24 часа. Если вы не регистрировались, ничего не подтверждайте.`,
    html:`<p>Подтвердите почту в аккаунте, в котором вы зарегистрировались, чтобы получить стартовые руны.</p><p><a href="${url}">Подтвердить почту</a></p><p>Ссылка действует 24 часа. Если вы не регистрировались, ничего не подтверждайте.</p>`,template:"bonus_email_verification"});
}
export async function verifyBonusEmail(accountId: string, token: string) {
  const {payload}=await jwtVerify(token,verificationSecret(),{algorithms:["HS256"],audience:"bonus-email"});
  if (payload.purpose!=="bonus-email" || payload.sub!==accountId) throw new Error("invalid_verification");
  return withTransaction(async client=>{
    const {rows}=await queryClient<{profile_user_id:string|null;email:string;token_version:number}>(client,
      "SELECT profile_user_id,email,token_version FROM user_accounts WHERE id=$1 AND erasure_requested_at IS NULL FOR UPDATE",[accountId]);
    const account=rows[0];
    if (!account || account.email!==payload.email || account.token_version!==payload.tv) throw new Error("invalid_verification");
    await queryClient(client,"UPDATE user_accounts SET bonus_email_verification_required=FALSE,email_verified_at=COALESCE(email_verified_at,NOW()) WHERE id=$1",[accountId]);
    return account.profile_user_id ? grantStarterRunesIfNeeded(account.profile_user_id,client) : null;
  });
}
