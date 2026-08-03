import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { validatePasswordLength } from "@/lib/auth-policy";
import { completePasswordReset } from "@/lib/password-reset";

export async function POST(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!token || !password) {
    return NextResponse.json({ error: "Заполните все поля" }, { status: 400 });
  }

  const pwErr = validatePasswordLength(password);
  if (pwErr) return NextResponse.json({ error: pwErr }, { status: 400 });

  const result = await completePasswordReset(token, password);
  if (!result.ok) {
    const msg =
      result.error === "expired"
        ? "Ссылка истекла — запросите новую."
        : "Ссылка недействительна — запросите новую.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
