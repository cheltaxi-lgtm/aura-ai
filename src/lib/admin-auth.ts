import { query } from "./db";
import { getAuth, verifyPassword } from "./auth";

export interface AdminAccount {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  is_active: boolean;
}

export async function findAdminByEmail(email: string): Promise<AdminAccount | null> {
  const { rows } = await query<AdminAccount>(
    "SELECT id, email, name, password_hash, is_active FROM admin_accounts WHERE email = $1",
    [email.toLowerCase()]
  );
  return rows[0] ?? null;
}

export async function verifyAdminPassword(password: string, hash: string) {
  return verifyPassword(password, hash);
}

export async function requireAdmin() {
  const auth = await getAuth();
  if (!auth || auth.role !== "admin") return null;
  return auth;
}
