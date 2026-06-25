import { findAdminByEmail } from "@/lib/admin-auth";
import { findExpertByEmail, findUserByEmail } from "@/lib/accounts";
import { normalizeAuthEmail } from "@/lib/auth";

export async function resolveLoginHint(
  email: string,
  role: "user" | "expert"
): Promise<string | null> {
  const normalized = normalizeAuthEmail(email);
  if (!normalized) return null;

  if (role === "user") {
    const [admin, expert] = await Promise.all([
      findAdminByEmail(normalized),
      findExpertByEmail(normalized),
    ]);
    if (admin) {
      return "Этот email зарегистрирован как администратор. Войдите через /admin/login";
    }
    if (expert) {
      return "Этот email — аккаунт мастера. Выберите «Мастер» на странице входа";
    }
    return null;
  }

  const [admin, user] = await Promise.all([
    findAdminByEmail(normalized),
    findUserByEmail(normalized),
  ]);
  if (admin) {
    return "Этот email зарегистрирован как администратор. Войдите через /admin/login";
  }
  if (user) {
    return "Этот email — аккаунт искателя. Выберите «Искатель» на странице входа";
  }
  return null;
}
