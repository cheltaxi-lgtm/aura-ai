import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { findUserByEmail } from "@/lib/accounts";
import { setAuthCookie, verifyPassword } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
    }

    const user = await findUserByEmail(email);
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    await setAuthCookie({
      sub: user.id,
      role: "user",
      email: user.email,
      name: user.name,
    });

    return NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name } });
  } catch (error) {
    console.error("User login error:", error);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}
