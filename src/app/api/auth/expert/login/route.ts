import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { findExpertByEmail } from "@/lib/accounts";
import { setAuthCookie, verifyPassword, normalizeAuthEmail } from "@/lib/auth";
import { resolveLoginHint } from "@/lib/login-hints";
import { clientIp, enforceLoginRateLimit } from "@/lib/api-guards";

export async function POST(request: NextRequest) {
  try {
    const rateLimited = await enforceLoginRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const { email: rawEmail, password } = await request.json();
    const email = normalizeAuthEmail(String(rawEmail ?? ""));
    if (!email || !password) {
      return NextResponse.json({ error: "Email и пароль обязательны" }, { status: 400 });
    }

    const expert = await findExpertByEmail(email);
    if (!expert || !(await verifyPassword(password, expert.password_hash))) {
      const hint = await resolveLoginHint(email, "expert");
      return NextResponse.json(
        { error: hint ?? "Неверный email или пароль" },
        { status: 401 }
      );
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
