import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { createUser, findUserByEmail, linkAccountToProfile } from "@/lib/accounts";
import { hashPassword, setAuthCookie } from "@/lib/auth";
import { verifyRecaptcha } from "@/lib/recaptcha";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { buildAstroMeta } from "@/lib/astro-profile";
import { getZodiacFromDate, formatZodiacLabel } from "@/utils/zodiac";
import { createUserProfile, linkSessionToUser, serializeUserProfile } from "@/lib/users";

export async function POST(request: NextRequest) {
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const body = await request.json();
    const {
      email,
      password,
      name,
      gender,
      birthDate,
      zodiac,
      birthTime,
      birthCity,
      lifeFocus,
      mainQuestion,
      sessionId,
      recaptchaToken,
    } = body;

    if (!email || !password || !name || !gender || !birthDate) {
      return NextResponse.json({ error: "Заполните все обязательные поля" }, { status: 400 });
    }

    const captcha = await verifyRecaptcha(recaptchaToken, request.headers.get("x-forwarded-for"));
    if (!captcha.ok) {
      return NextResponse.json({ error: captcha.error }, { status: 400 });
    }
    if (password.length < 6) {
      return NextResponse.json({ error: "Пароль минимум 6 символов" }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Email уже зарегистрирован" }, { status: 409 });
    }

    const sign = getZodiacFromDate(birthDate);
    const astroMeta = buildAstroMeta(birthDate);
    if (!sign || !astroMeta) {
      return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
    }

    const account = await createUser(email, await hashPassword(password), name.trim());

    const profile = await createUserProfile({
      name: name.trim(),
      gender,
      birthDate,
      zodiac: zodiac || formatZodiacLabel(sign),
      birthTime,
      birthCity,
      lifeFocus,
      mainQuestion,
      astroMeta,
    });

    await linkAccountToProfile(account.id, profile.id);
    await grantStarterRunesIfNeeded(profile.id);

    if (sessionId) {
      await linkSessionToUser(sessionId, profile.id);
    }

    await setAuthCookie({
      sub: account.id,
      role: "user",
      email: account.email,
      name: account.name,
    });

    return NextResponse.json({
      ok: true,
      user: { id: account.id, email: account.email, name: account.name },
      profile: serializeUserProfile(profile),
    });
  } catch (error) {
    console.error("User register error:", error);
    return NextResponse.json({ error: "Ошибка регистрации" }, { status: 500 });
  }
}
