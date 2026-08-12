import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount, hasAccountAgeConfirmed } from "@/lib/accounts";
import { AGE_REQUIRED_ERROR } from "@/lib/age-gate";
import { requireUserAuth } from "@/lib/require-auth";
import { syncRetroactiveAchievements } from "@/lib/achievements";
import { pruneDuplicateActiveSessions, pruneEmptySessionStubs } from "@/lib/session";
import { grantStarterRunesIfNeeded } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import {  getCabinetProfile,
    getCabinetStats,
    getCabinetAchievements,
    getCabinetSessions,
    getCabinetDiaryPreview,
    getCabinetRunes,
    getCabinetLegacyAccess,
    getCabinetPhotoSpreads,
    getCabinetDailyReadings,
  } from "@/lib/cabinet-data";

export const dynamic = "force-dynamic";

async function safe<T>(
  key: string,
  fn: () => Promise<T>,
  fallback: T,
  errors: string[]
): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[cabinet]", key, e);
    errors.push(key);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Сервис временно недоступен. Попробуйте позже." }, { status: 503 });
  }

  if (!(await hasAccountAgeConfirmed(auth.sub))) {
    return NextResponse.json(AGE_REQUIRED_ERROR, { status: 403 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    const runeSettings = await getRuneSettings();
    return NextResponse.json({
      needsOnboarding: true,
      needsProfile: true,
      profile: {
        id: auth.sub,
        name: auth.name ?? "Пользователь",
        email: auth.email,
        zodiac: null,
        birthDate: null,
        birthCity: null,
        runeBalance: 0,
        createdAt: null,
      },
      stats: {
        totalSessions: 0,
        favoriteMaster: null,
        daysWithUs: 0,
        totalCards: 0,
      },
      achievements: { earned: [], locked: [] },
      sessions: [],
      sessionsTotal: 0,
      sessionsHasMore: false,
      diaryPreview: [],
      runes: { enabled: runeSettings.enabled, balance: 0, transactions: [] },
      legacyAccess: null,
      photoSpreads: [],
      dailyReadings: [],
    });
  }

  await grantStarterRunesIfNeeded(profileUserId);

  const { searchParams } = new URL(request.url);
  const sessionsLimit = Math.min(
    50,
    Math.max(1, Number.parseInt(searchParams.get("sessionsLimit") ?? "50", 10) || 50)
  );
  const sessionsOffset = Math.max(
    0,
    Number.parseInt(searchParams.get("sessionsOffset") ?? "0", 10) || 0
  );

  if (sessionsOffset === 0) {
    await safe(
      "cleanup",
      async () => {
        await pruneEmptySessionStubs(profileUserId);
        await pruneDuplicateActiveSessions(profileUserId);
        await syncRetroactiveAchievements(profileUserId);
      },
      undefined,
      []
    );
  }

  const errors: string[] = [];

  const [    profile,
    stats,
    achievements,
    sessionsData,
    diaryPreview,
    runes,
    legacyAccess,
    photoSpreads,
    dailyReadings,
  ] = await Promise.all([
    safe(
      "profile",
      () =>
        getCabinetProfile(profileUserId, auth.email, auth.name ?? "Пользователь"),
      {
        id: profileUserId,
        name: auth.name ?? "Пользователь",
        email: auth.email,
        zodiac: null,
        birthDate: null,
        birthCity: null,
        runeBalance: 0,
        createdAt: null,
      },
      errors
    ),
    safe(
      "stats",
      () => getCabinetStats(profileUserId),
      { totalSessions: 0, favoriteMaster: null, daysWithUs: 0, totalCards: 0 },
      errors
    ),
    safe(
      "achievements",
      () => getCabinetAchievements(profileUserId),
      { earned: [], locked: [] },
      errors
    ),
    safe(
      "sessions",
      () => getCabinetSessions(profileUserId, sessionsLimit, sessionsOffset),
      { sessions: [], total: 0 },
      errors
    ),
    safe("diaryPreview", () => getCabinetDiaryPreview(profileUserId, 3), [], errors),
    safe(
      "runes",
      () => getCabinetRunes(profileUserId),
      { enabled: false, balance: 0, transactions: [] },
      errors
    ),
    safe("legacyAccess", () => getCabinetLegacyAccess(profileUserId), null, errors),
    safe("photoSpreads", () => getCabinetPhotoSpreads(profileUserId), [], errors),
    safe("dailyReadings", () => getCabinetDailyReadings(profileUserId), [], errors),
  ]);

  // Progressive birth profile — does not block Tarot or cabinet access.
  const needsBirthProfile =
    !profile.birthDate || !(profile.birthCity || "").trim();

  return NextResponse.json({
    needsOnboarding: needsBirthProfile,
    needsBirthProfile,
    profile,
    stats,
    achievements,
    sessions: sessionsData.sessions,
    sessionsTotal: sessionsData.total,
    sessionsHasMore: sessionsOffset + sessionsData.sessions.length < sessionsData.total,
    diaryPreview,
    runes,
    legacyAccess,
    photoSpreads,
    dailyReadings,
    partial: errors.length > 0,
    errors,
  });
}
