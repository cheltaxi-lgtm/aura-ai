import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  getAccountConsentSnapshot,
  getProfileUserIdForAccount,
  updateUserAccountName,
} from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { validateDisplayName } from "@/lib/auth-policy";
import {
  createUserProfileForAccount,
  getUserById,
  serializeUserProfile,
  updateUserProfile,
  linkSessionToUser,
} from "@/lib/users";
import { getUserReadingHistory } from "@/lib/accounts";
import { readSessionClaimCookie } from "@/lib/session-claim";
import { upsertFact } from "@/lib/memory/user-facts";
import { mastersWithReadingForSpread } from "@/lib/reading-progress";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import {
  cleanupStaleTripletDisplay,
  userHasConsultationActivity,
  type TripletReadingRow,
} from "@/lib/triplet-cleanup";
import { tarotCardsKey } from "@/lib/tarot";
import { resolveTripletDisplaySpread } from "@/lib/spread-context";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { DEFAULT_SPREAD_ID, hasCompleteSpread } from "@/lib/spreads";
import { astroMetaFromBirthDate } from "@/lib/registration-consent";
import { formatZodiacLabel, getZodiacFromDate } from "@/utils/zodiac";
import { scheduleNatalChartCompute } from "@/lib/services/natal-chart-service";
import type { LifeFocus, AstroMeta } from "@/lib/astro-profile";

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({
      profile: null,
      profileUserId: null,
      needsProfile: true,
      readings: [],
    });
  }

  if (profileUserId) {
    await grantStarterRunesIfNeeded(profileUserId);
  }

  const [profile, readingsRaw, hasConsultationActivity] = await Promise.all([
    getUserById(profileUserId),
    getUserReadingHistory(profileUserId),
    userHasConsultationActivity(profileUserId),
  ]);

  const readingsForCleanup = readingsRaw.map((r) => ({
    characterName: r.character_name,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    contextData: r.context_data as TripletReadingRow["contextData"],
  }));

  const orphanCleaned = await cleanupStaleTripletDisplay(profileUserId, readingsForCleanup);
  const readings = orphanCleaned
    ? await getUserReadingHistory(profileUserId)
    : readingsRaw;

  const mappedReadings = readings.map((r) => ({
    id: r.id,
    characterName: r.character_name,
    contextData: r.context_data,
    isPaid: r.is_paid,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  const latestSpread = resolveTripletDisplaySpread(mappedReadings, null, DEFAULT_DECK_SYSTEM);
  const dailyCardNames = latestSpread.cards.map((c) => c.name);
  const spreadCards = hasCompleteSpread(dailyCardNames, DEFAULT_SPREAD_ID, "daily")
    ? latestSpread.cards.map((c) => ({ name: c.name }))
    : undefined;

  const continueMasterIds = mastersWithReadingForSpread(mappedReadings, spreadCards);

  const tripletCooldown = await checkTripletCooldown(profileUserId);

  return NextResponse.json({
    profileUserId,
    needsProfile: false,
    profile: profile ? serializeUserProfile(profile) : null,
    readings: mappedReadings,
    continueMasterIds,
    spreadCardsKey: tarotCardsKey(spreadCards),
    spreadId: spreadCards ? DEFAULT_SPREAD_ID : null,
    tripletCooldown,
    hasConsultationActivity,
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      name,
      gender,
      birthDate,
      birthTime,
      birthCity,
      lifeFocus,
      mainQuestion,
      sessionId,
    } = body as {
      name?: string;
      gender?: "male" | "female";
      birthDate?: string;
      birthTime?: string;
      birthCity?: string;
      lifeFocus?: LifeFocus;
      mainQuestion?: string;
      sessionId?: string;
    };

    if (name !== undefined) {
      const nameError = validateDisplayName(name);
      if (nameError) {
        return NextResponse.json({ error: nameError }, { status: 400 });
      }
    }

    if (!birthDate && !name && !gender && !lifeFocus) {
      return NextResponse.json({ error: "Нет данных для обновления" }, { status: 400 });
    }

    let profileUserId = await getProfileUserIdForAccount(auth.sub);
    let profile = profileUserId ? await getUserById(profileUserId) : null;

    if (!birthDate && !profile?.birth_date) {
      return NextResponse.json({ error: "Укажите дату рождения" }, { status: 400 });
    }

    const effectiveBirthDate = birthDate ?? profile!.birth_date;
    const sign = getZodiacFromDate(effectiveBirthDate);
    const consent = (await getAccountConsentSnapshot(auth.sub)) ?? {
      termsAcceptedAt: null,
      ageConfirmedAt: null,
      marketingConsent: false,
      marketingConsentAt: null,
    };
    const astroMeta = astroMetaFromBirthDate(effectiveBirthDate, consent) as AstroMeta | undefined;
    if (!sign || !astroMeta) {
      return NextResponse.json({ error: "Некорректная дата рождения" }, { status: 400 });
    }

    const payload = {
      name: (name ?? profile?.name ?? auth.name).trim(),
      gender: gender ?? profile?.gender ?? "female",
      birthDate: effectiveBirthDate,
      zodiac: formatZodiacLabel(sign),
      birthTime: birthTime ?? profile?.birth_time ?? undefined,
      birthCity: birthCity ?? profile?.birth_city ?? undefined,
      lifeFocus: (lifeFocus ?? profile?.life_focus ?? "general") as LifeFocus,
      mainQuestion: mainQuestion ?? profile?.main_question ?? undefined,
      astroMeta,
    };

    if (profileUserId && profile) {
      profile = await updateUserProfile(profileUserId, payload);
      await grantStarterRunesIfNeeded(profileUserId);
    } else {
      try {
        profile = await createUserProfileForAccount(auth.sub, payload);
      } catch (error) {
        if ((error as Error).message === "PROFILE_OWNERSHIP_CONFLICT") {
          return NextResponse.json(
            { error: "Профиль уже привязан к другому аккаунту", code: "PROFILE_OWNERSHIP_CONFLICT" },
            { status: 409 }
          );
        }
        throw error;
      }
      profileUserId = profile.id;
      await grantStarterRunesIfNeeded(profileUserId);
    }

    if (sessionId && profileUserId) {
      try {
        const claimToken = await readSessionClaimCookie();
        await linkSessionToUser(String(sessionId), profileUserId, claimToken);
      } catch (linkError) {
        console.warn("Profile session link skipped:", linkError);
      }
    }

    if (name?.trim()) {
      await updateUserAccountName(auth.sub, payload.name);
    }

    const serialized = profile ? serializeUserProfile(profile) : null;

    // Seed the client's main question into long-term memory so it is
    // semantically searchable across masters (vector dedup collapses repeats).
    const trimmedQuestion = mainQuestion?.trim();
    if (profileUserId && trimmedQuestion && trimmedQuestion.length >= 8) {
      void upsertFact(profileUserId, {
        fact: `Главный запрос клиента: ${trimmedQuestion}`,
        category: "goal",
        salience: 4,
        sourceCharacter: "profile",
      }).catch((err) => console.warn("[memory] seed main question failed:", err));
    }

    const birthFieldsTouched =
      birthDate !== undefined || birthTime !== undefined || birthCity !== undefined;
    if (profileUserId && birthFieldsTouched) {
      scheduleNatalChartCompute(profileUserId);
    }

    return NextResponse.json({
      ok: true,
      profileUserId,
      needsProfile: false,
      profile: serialized,
    });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json({ error: "Ошибка сохранения профиля" }, { status: 500 });
  }
}

