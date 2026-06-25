import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { requireUserAuth } from "@/lib/require-auth";
import { pruneDuplicateActiveSessions, pruneEmptySessionStubs } from "@/lib/session";
import {  getCabinetProfile,
  getCabinetStats,
  getCabinetAchievements,
  getCabinetSessions,
  getCabinetDiaryPreview,
  getCabinetRunes,
  getCabinetLegacyAccess,
  getCabinetPhotoSpreads,
} from "@/lib/cabinet-data";

export const dynamic = "force-dynamic";

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    console.error("[cabinet]", e);
    return fallback;
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
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
    await safe(async () => {
      await pruneEmptySessionStubs(profileUserId);
      await pruneDuplicateActiveSessions(profileUserId);
    }, undefined);
  }

  const [    profile,
    stats,
    achievements,
    sessionsData,
    diaryPreview,
    runes,
    legacyAccess,
    photoSpreads,
  ] = await Promise.all([
    safe(
      () =>
        getCabinetProfile(profileUserId, auth.email, auth.name ?? "Пользователь"),
      {
        id: profileUserId,
        name: auth.name ?? "Пользователь",
        email: auth.email,
        zodiac: null,
        birthDate: null,
        runeBalance: 0,
        createdAt: null,
      }
    ),
    safe(() => getCabinetStats(profileUserId), {
      totalSessions: 0,
      favoriteMaster: null,
      daysWithUs: 0,
      totalCards: 0,
    }),
    safe(() => getCabinetAchievements(profileUserId), { earned: [], locked: [] }),
    safe(() => getCabinetSessions(profileUserId, sessionsLimit, sessionsOffset), {
      sessions: [],
      total: 0,
    }),
    safe(() => getCabinetDiaryPreview(profileUserId, 3), []),
    safe(() => getCabinetRunes(profileUserId), {
      enabled: false,
      balance: 0,
      transactions: [],
    }),
    safe(() => getCabinetLegacyAccess(profileUserId), null),
    safe(() => getCabinetPhotoSpreads(profileUserId), []),
  ]);

  return NextResponse.json({
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
  });
}
