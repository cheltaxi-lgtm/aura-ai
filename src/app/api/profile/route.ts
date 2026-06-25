import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import {
  getProfileUserIdForAccount,
  linkAccountToProfile,
  updateUserAccountName,
} from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import {
  createUserProfile,
  getUserById,
  serializeUserProfile,
  updateUserProfile,
} from "@/lib/users";
import { getUserReadingHistory } from "@/lib/accounts";
import { upsertFact } from "@/lib/memory/user-facts";
import { mastersWithReadingForSpread } from "@/lib/reading-progress";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import {
  cleanupStaleTripletDisplay,
  userHasConsultationActivity,
  type TripletReadingRow,
} from "@/lib/triplet-cleanup";
import { tarotCardsKey } from "@/lib/tarot";
import { resolveTripletDisplaySpread } from "@/lib/spread-context";
import { DEFAULT_DECK_SYSTEM } from "@/lib/decks";
import { buildAstroMeta } from "@/lib/astro-profile";
import { formatZodiacLabel, getZodiacFromDate } from "@/utils/zodiac";
import type { LifeFocus } from "@/lib/astro-profile";

export async function GET() {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ profile: null, readings: [] });
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
  const spreadCards =
    latestSpread.cards.length >= 3
      ? latestSpread.cards.map((c) => ({ name: c.name }))
      : undefined;

  const continueMasterIds = mastersWithReadingForSpread(mappedReadings, spreadCards);

  const tripletCooldown = await checkTripletCooldown(profileUserId);

  return NextResponse.json({
    profileUserId,
    profile: profile ? serializeUserProfile(profile) : null,
    readings: mappedReadings,
    continueMasterIds,
    spreadCardsKey: tarotCardsKey(spreadCards),
    tripletCooldown,
    hasConsultationActivity,
  });
}

export async function PATCH(request: NextRequest) {
  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
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
    } = body as {
      name?: string;
      gender?: "male" | "female";
      birthDate?: string;
      birthTime?: string;
      birthCity?: string;
      lifeFocus?: LifeFocus;
      mainQuestion?: string;
    };

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
    const astroMeta = buildAstroMeta(effectiveBirthDate);
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
    } else {
      profile = await createUserProfile(payload);
      profileUserId = profile.id;
      const linked = await linkAccountToProfile(auth.sub, profileUserId);
      if (!linked) {
        return NextResponse.json(
          { error: "Профиль уже привязан к другому аккаунту", code: "PROFILE_OWNERSHIP_CONFLICT" },
          { status: 409 }
        );
      }
    }

    if (name?.trim()) {
      await updateUserAccountName(auth.sub, name.trim());
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

    return NextResponse.json({
      ok: true,
      profileUserId,
      profile: serialized,
    });
  } catch (error) {
    console.error("Profile PATCH error:", error);
    return NextResponse.json({ error: "Ошибка сохранения профиля" }, { status: 500 });
  }
}

