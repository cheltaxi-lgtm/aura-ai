import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireAdmin } from "@/lib/admin-auth";
import { adminLogin, setAdminSession } from "@/lib/admin-login";
import { clientIp, enforceLoginRateLimit } from "@/lib/api-guards";

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceLoginRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
    }
    const payload = await adminLogin(email, password);
    if (!payload) {
      return NextResponse.json({ error: "Неверные данные или аккаунт отключён" }, { status: 401 });
    }
    await setAdminSession(payload, request);
    return NextResponse.json({ ok: true, admin: { email: payload.email, name: payload.name } });
  } catch (error) {
    console.error("Admin login error:", error);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth) return NextResponse.json({ authenticated: false }, { status: 401 });
  return NextResponse.json({ authenticated: true, admin: { email: auth.email, name: auth.name } });
}
