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
import { getUserChatHistory, getUserReadingHistory } from "@/lib/accounts";
import { mergeContinueMasterIds } from "@/lib/reading-progress";
import { checkTripletCooldown } from "@/lib/triplet-limit-server";
import { tarotCardsKey } from "@/lib/tarot";
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

  const [profile, readings, chatRows] = await Promise.all([
    getUserById(profileUserId),
    getUserReadingHistory(profileUserId),
    getUserChatHistory(profileUserId),
  ]);

  const mappedReadings = readings.map((r) => ({
    id: r.id,
    characterName: r.character_name,
    contextData: r.context_data,
    isPaid: r.is_paid,
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
  }));

  const latestTriplet = mappedReadings.find((r) => r.characterName === "triplet");
  const spreadCards = latestTriplet?.contextData?.tarotCards as { name: string }[] | undefined;

  const continueMasterIds = mergeContinueMasterIds(mappedReadings, spreadCards, {
    chatRows: chatRows.map((row) => ({
      characterId: row.character_id,
      role: row.role,
      content: row.content,
      createdAt:
        row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    })),
  });

  const tripletCooldown = await checkTripletCooldown(profileUserId);

  return NextResponse.json({
    profileUserId,
    profile: profile ? serializeUserProfile(profile) : null,
    readings: mappedReadings,
    continueMasterIds,
    spreadCardsKey: tarotCardsKey(spreadCards),
    tripletCooldown,
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
      await linkAccountToProfile(auth.sub, profileUserId);
    }

    if (name?.trim()) {
      await updateUserAccountName(auth.sub, name.trim());
    }

    const serialized = profile ? serializeUserProfile(profile) : null;

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

