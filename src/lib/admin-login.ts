import { query } from "./db";
import { findAdminByEmail, verifyAdminPassword } from "./admin-auth";
import { hashPassword, setAuthCookie, type AuthPayload, type CookieRequestContext } from "./auth";
import { logAdminAction } from "./admin";

export { findAdminByEmail, verifyAdminPassword };

export async function ensureAdminAccount(email: string, password: string, name: string) {
  const existing = await findAdminByEmail(email);
  if (existing) {
    await query("UPDATE admin_accounts SET password_hash = $2, name = $3, is_active = TRUE WHERE email = $1", [
      email.toLowerCase(),
      await hashPassword(password),
      name,
    ]);
    return existing.id;
  }
  const { rows } = await query<{ id: string }>(
    "INSERT INTO admin_accounts (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id",
    [email.toLowerCase(), await hashPassword(password), name]
  );
  return rows[0].id;
}

export async function adminLogin(email: string, password: string): Promise<AuthPayload | null> {
  const admin = await findAdminByEmail(email);
  if (!admin || !admin.is_active) return null;
  if (!(await verifyAdminPassword(password, admin.password_hash))) return null;
  return { sub: admin.id, role: "admin", email: admin.email, name: admin.name };
}

export async function setAdminSession(payload: AuthPayload, request?: CookieRequestContext) {
  await setAuthCookie(payload, request);
  try {
    await logAdminAction(payload.sub, "login", "admin", payload.sub);
  } catch (error) {
    console.warn("Admin audit log skipped:", error);
  }
}
