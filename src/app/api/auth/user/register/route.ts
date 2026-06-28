import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { createUser, findUserByEmail, linkAccountToProfile } from "@/lib/accounts";
import { hashPassword, setAuthCookie, normalizeAuthEmail } from "@/lib/auth";
import { clientIp, enforceRegisterRateLimit } from "@/lib/api-guards";
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

    const rateLimited = await enforceRegisterRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    const body = await request.json();
    const {
      email: rawEmail,
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
      marketingConsent,
      ageConfirmed,
    } = body;

    if (!rawEmail || !password || !name || !gender || !birthDate) {
      return NextResponse.json({ error: "Заполните все обязательные поля" }, { status: 400 });
    }

    if (ageConfirmed !== true) {
      return NextResponse.json({ error: "Подтвердите, что вам исполнилось 18 лет" }, { status: 400 });
    }

    const email = normalizeAuthEmail(String(rawEmail));

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
    const baseAstroMeta = buildAstroMeta(birthDate);
    if (!sign || !baseAstroMeta) {
      return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
    }

    const astroMeta = {
      ...baseAstroMeta,
      ageConfirmed: true,
      ageConfirmedAt: new Date().toISOString(),
      marketingConsent: Boolean(marketingConsent),
      ...(marketingConsent
        ? { marketingConsentAt: new Date().toISOString() }
        : {}),
    };

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

    const profileLinked = await linkAccountToProfile(account.id, profile.id);
    if (!profileLinked) {
      console.error("Profile link on register failed: profile already owned by another account");
      return NextResponse.json({ error: "Не удалось создать профиль" }, { status: 500 });
    }
    await grantStarterRunesIfNeeded(profile.id);

    let sessionLinked = false;
    if (sessionId) {
      try {
        sessionLinked = await linkSessionToUser(sessionId, profile.id);
        if (!sessionLinked) {
          console.warn("Session link on register skipped: session belongs to another profile");
        }
      } catch (linkErr) {
        console.warn("Session link on register skipped:", linkErr);
      }
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
      sessionLinked,
    });
  } catch (error) {
    console.error("User register error:", error);
    return NextResponse.json({ error: "Ошибка регистрации" }, { status: 500 });
  }
}
