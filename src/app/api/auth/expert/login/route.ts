import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { findExpertByEmail } from "@/lib/accounts";
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

    const expert = await findExpertByEmail(email);
    if (!expert || !(await verifyPassword(password, expert.password_hash))) {
      return NextResponse.json({ error: "Неверный email или пароль" }, { status: 401 });
    }

    await setAuthCookie({
      sub: expert.id,
      role: "expert",
      email: expert.email,
      name: expert.name,
      slug: expert.slug,
    });

    return NextResponse.json({
      ok: true,
      expert: { id: expert.id, email: expert.email, name: expert.name, slug: expert.slug },
    });
  } catch (error) {
    console.error("Expert login error:", error);
    return NextResponse.json({ error: "Ошибка входа" }, { status: 500 });
  }
}
