import { NextRequest, NextResponse } from "next/server";
import { ensureDb, query } from "@/lib/db";
import { getAccountConsentSnapshot, getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { validateDisplayName } from "@/lib/auth-policy";
import {
  createUserProfileForAccount,
  createHistoryEntry,
  getUserById,
  serializeUserProfile,
  updateUserProfile,
  getLatestHistoryEntry,
  linkSessionToUser,
  recordTripletDrawAnchor,
} from "@/lib/users";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import type { AstroMeta } from "@/lib/astro-profile";
import { astroMetaFromBirthDate } from "@/lib/registration-consent";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { tarotCardsKey } from "@/lib/tarot";
import { scheduleNatalChartCompute } from "@/lib/services/natal-chart-service";
import { isNatalChartEnabled } from "@/lib/settings";

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export async function POST(request: NextRequest) {
  let step = "init";
  try {
    if (!(await ensureDb())) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
    }

    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "Требуется регистрация" }, { status: 401 });
    }

    const {
      name,
      gender,
      birthDate,
      zodiac,
      birthTime,
      birthCity,
      lifeFocus,
      mainQuestion,
      sessionId,
      tarotCards,
      teaser,
      deckSystem,
      masterId,
    } = await request.json();

    if (!name || !gender || !birthDate || !zodiac) {
      const missing = [
        !name && "name",
        !gender && "gender",
        !birthDate && "birthDate",
        !zodiac && "zodiac",
      ].filter(Boolean);
      console.error("Onboarding 400 missing fields:", missing);
      return NextResponse.json(
        { error: "Заполните профиль", code: "MISSING_PROFILE", missing },
        { status: 400 }
      );
    }

    const nameError = validateDisplayName(name);
    if (nameError) {
      return NextResponse.json({ error: nameError, code: "INVALID_NAME" }, { status: 400 });
    }

    if (!tarotCards?.length) {
      return NextResponse.json({ error: "Сначала выберите карты" }, { status: 400 });
    }

    const birthMs = Date.parse(String(birthDate));
    const now = Date.now();
    if (Number.isNaN(birthMs) || birthMs > now) {
      return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
    }
    const minBirth = new Date();
    minBirth.setFullYear(minBirth.getFullYear() - 120);
    if (birthMs < minBirth.getTime()) {
      return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
    }

    const normalizedBirthTime = normalizeOptionalText(birthTime);
    const normalizedBirthCity = normalizeOptionalText(birthCity);

    step = "astro_meta";
    const consent = (await getAccountConsentSnapshot(auth.sub)) ?? {
      termsAcceptedAt: null,
      ageConfirmedAt: null,
      marketingConsent: false,
      marketingConsentAt: null,
    };
    const astroMeta = astroMetaFromBirthDate(String(birthDate), consent) as AstroMeta | undefined;
    let profileUserId = await getProfileUserIdForAccount(auth.sub);
    if (profileUserId) {
      const linkedUser = await getUserById(profileUserId);
      if (!linkedUser) {
        await query("UPDATE user_accounts SET profile_user_id = NULL WHERE id = $1", [auth.sub]);
        profileUserId = null;
      }
    }
    let user = profileUserId ? await getUserById(profileUserId) : null;

    if (!user) {
      step = "create_user";
      try {
        user = await createUserProfileForAccount(auth.sub, {
          name: String(name).trim(),
          gender,
          birthDate,
          zodiac,
          birthTime: normalizedBirthTime,
          birthCity: normalizedBirthCity,
          lifeFocus,
          mainQuestion,
          astroMeta,
        });
      } catch (error) {
        if ((error as Error).message === "PROFILE_OWNERSHIP_CONFLICT") {
          return NextResponse.json(
            { error: "Профиль уже привязан к другому аккаунту", code: "PROFILE_OWNERSHIP_CONFLICT" },
            { status: 409 }
          );
        }
        throw error;
      }
      profileUserId = user.id;
      step = "starter_runes";
      await grantStarterRunesIfNeeded(user.id);
    } else {
      step = "update_user";
      const updated = await updateUserProfile(user.id, {
        name: String(name).trim(),
        gender,
        birthDate,
        zodiac,
        birthTime: normalizedBirthTime,
        birthCity: normalizedBirthCity,
        lifeFocus,
        mainQuestion,
        astroMeta,
      });
      if (updated) user = updated;
      await grantStarterRunesIfNeeded(user.id);
    }

    const verifiedUser = await getUserById(user.id);
    if (!verifiedUser) {
      throw new Error(`Profile user ${user.id} not found after save`);
    }
    user = verifiedUser;

    if (await isNatalChartEnabled()) {
      scheduleNatalChartCompute(user.id);
    }

    if (sessionId) {
      try {
        await linkSessionToUser(String(sessionId), user.id);
      } catch (linkError) {
        console.warn("Onboarding session link skipped:", linkError);
      }
    }

    step = "cooldown_check";
    const cooldown = await checkTripletCooldown(user.id);
    if (!cooldown.allowed) {
      return NextResponse.json({
        userId: user.id,
        profile: serializeUserProfile(user),
        cooldownBlocked: true,
        message: "Новый расклад из 3 карт доступен один раз в сутки",
        nextAvailableAt: cooldown.nextAvailableAt,
      });
    }

    const cardsKey = tarotCardsKey(tarotCards ?? []);
    const latestTriplet = await getLatestHistoryEntry(user.id, { characterName: "triplet" });
    if (latestTriplet && cardsKey) {
      const existingKey = tarotCardsKey(
        latestTriplet.context_data?.tarotCards as { name: string }[] | undefined
      );
      const ageMs = Date.now() - new Date(latestTriplet.created_at).getTime();
      if (existingKey === cardsKey && ageMs < 60_000) {
        return NextResponse.json({
          userId: user.id,
          historyId: latestTriplet.id,
          profile: serializeUserProfile(user),
          reused: true,
        });
      }
    }

    step = "create_history";
    const history = await createHistoryEntry({
      userId: user.id,
      characterName: "triplet",
      contextData: {
        type: "triplet",
        tarotCards: tarotCards ?? [],
        deckSystem: typeof deckSystem === "string" ? deckSystem : undefined,
        masterId: typeof masterId === "string" ? masterId : undefined,
        teaser,
        onboarding: {
          name,
          gender,
          birthDate,
          zodiac,
          birthTime: normalizedBirthTime,
          birthCity: normalizedBirthCity,
          lifeFocus,
          mainQuestion,
          astroMeta,
        },
      },
    });

    await recordTripletDrawAnchor(user.id);

    return NextResponse.json({
      userId: user.id,
      historyId: history.id,
      profile: serializeUserProfile(user),
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error("Onboarding error at step:", step, detail, error);
    return NextResponse.json(
      { error: "Ошибка сохранения профиля", code: "ONBOARDING_FAILED", step },
      { status: 500 }
    );
  }
}

