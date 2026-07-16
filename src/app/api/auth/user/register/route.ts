import { NextRequest, NextResponse } from "next/server";
import { ensureDb, queryClient, withTransaction } from "@/lib/db";
import { findUserByEmail } from "@/lib/accounts";
import { validateDisplayName, validatePasswordLength } from "@/lib/auth-policy";
import { hashPassword, setAuthCookie, normalizeAuthEmail } from "@/lib/auth";
import { clientIp, enforceRegisterRateLimit } from "@/lib/api-guards";
import { enforceRecaptchaScope } from "@/lib/recaptcha-guard";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { buildAstroMeta } from "@/lib/astro-profile";
import { getZodiacFromDate, formatZodiacLabel } from "@/utils/zodiac";
import { linkSessionToUser, serializeUserProfile, type UserRow } from "@/lib/users";
import { sendWelcomeEmail } from "@/lib/email/send";
import { mergeConsentIntoAstroMeta } from "@/lib/registration-consent";

export async function POST(request: NextRequest) {
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
    }

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
      acceptedTerms,
    } = body;

    if (!rawEmail || !password || !name) {
      return NextResponse.json({ error: "Заполните все обязательные поля" }, { status: 400 });
    }

    if (acceptedTerms !== true) {
      return NextResponse.json(
        { error: "Подтвердите согласие с пользовательским соглашением" },
        { status: 400 }
      );
    }

    if (ageConfirmed !== true) {
      return NextResponse.json({ error: "Подтвердите, что вам исполнилось 18 лет" }, { status: 400 });
    }

    const nameError = validateDisplayName(name);
    if (nameError) {
      return NextResponse.json({ error: nameError }, { status: 400 });
    }
    const trimmedName = String(name).trim();

    const email = normalizeAuthEmail(String(rawEmail));

    const captchaBlock = await enforceRecaptchaScope("register", recaptchaToken, request);
    if (captchaBlock) return captchaBlock;

    const rateLimited = await enforceRegisterRateLimit(clientIp(request));
    if (rateLimited) return rateLimited;

    const passwordError = validatePasswordLength(String(password));
    if (passwordError) {
      return NextResponse.json({ error: passwordError }, { status: 400 });
    }

    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json({ error: "Email уже зарегистрирован" }, { status: 409 });
    }

    const consentNow = new Date().toISOString();
    const accountConsent = {
      termsAcceptedAt: consentNow,
      ageConfirmedAt: consentNow,
      marketingConsent: Boolean(marketingConsent),
      marketingConsentAt: marketingConsent ? consentNow : null,
    };

    const hasAstroProfile = Boolean(gender && birthDate);
    let profilePayload: {
      gender: "male" | "female";
      birthDate: string;
      zodiac: string;
      birthTime?: string;
      birthCity?: string;
      lifeFocus?: string;
      mainQuestion?: string;
      astroMeta: Record<string, unknown>;
    } | null = null;

    if (hasAstroProfile) {
      const sign = getZodiacFromDate(String(birthDate));
      const baseAstroMeta = buildAstroMeta(String(birthDate));
      if (!sign || !baseAstroMeta) {
        return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
      }

      profilePayload = {
        gender,
        birthDate: String(birthDate),
        zodiac: zodiac || formatZodiacLabel(sign),
        birthTime,
        birthCity,
        lifeFocus,
        mainQuestion,
        astroMeta: mergeConsentIntoAstroMeta(
          baseAstroMeta as unknown as Record<string, unknown>,
          accountConsent
        ),
      };
    }

    const passwordHash = await hashPassword(String(password));
    const { account, profile } = await withTransaction(async (client) => {
      const accountResult = await queryClient<{ id: string; email: string; name: string }>(
        client,
        `INSERT INTO user_accounts (
           email, password_hash, name,
           terms_accepted_at, age_confirmed_at, marketing_consent, marketing_consent_at
         )
         VALUES ($1, $2, $3, $4::timestamptz, $5::timestamptz, $6, $7::timestamptz)
         RETURNING id, email, name`,
        [
          email,
          passwordHash,
          trimmedName,
          accountConsent.termsAcceptedAt,
          accountConsent.ageConfirmedAt,
          accountConsent.marketingConsent,
          accountConsent.marketingConsentAt,
        ]
      );
      const createdAccount = accountResult.rows[0];
      let createdProfile: UserRow | null = null;

      if (profilePayload) {
        const profileResult = await queryClient<UserRow>(
          client,
          `INSERT INTO users (
             name, gender, birth_date, zodiac,
             birth_time, birth_city, life_focus, main_question, astro_meta
           )
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING id, name, gender, birth_date::text, zodiac,
             birth_time::text, birth_city, life_focus, main_question, astro_meta, created_at`,
          [
            trimmedName,
            profilePayload.gender,
            profilePayload.birthDate,
            profilePayload.zodiac,
            profilePayload.birthTime ?? null,
            profilePayload.birthCity ?? null,
            profilePayload.lifeFocus ?? "general",
            profilePayload.mainQuestion ?? null,
            JSON.stringify(profilePayload.astroMeta),
          ]
        );
        createdProfile = profileResult.rows[0];
        await queryClient(
          client,
          "UPDATE user_accounts SET profile_user_id = $2 WHERE id = $1",
          [createdAccount.id, createdProfile.id]
        );
      }

      return { account: createdAccount, profile: createdProfile };
    });

    if (profile) {
      await grantStarterRunesIfNeeded(profile.id);
    }

    let sessionLinked = false;
    if (sessionId && profile) {
      try {
        sessionLinked = await linkSessionToUser(sessionId, profile.id);
        if (!sessionLinked) {
          console.warn("Session link on register skipped: session belongs to another profile");
        }
      } catch (linkErr) {
        console.warn("Session link on register skipped:", linkErr);
      }
    }

    await setAuthCookie(
      {
        sub: account.id,
        role: "user",
        email: account.email,
        name: account.name,
      },
      request
    );

    void sendWelcomeEmail(account.email, account.name || account.email, {
      needsOnboarding: !profile,
    });

    return NextResponse.json({
      ok: true,
      user: { id: account.id, email: account.email, name: account.name },
      profile: profile ? serializeUserProfile(profile) : null,
      sessionLinked,
      needsProfile: !profile,
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      return NextResponse.json({ error: "Email уже зарегистрирован" }, { status: 409 });
    }
    console.error("User register error:", error);
    return NextResponse.json({ error: "Ошибка регистрации" }, { status: 500 });
  }
}
