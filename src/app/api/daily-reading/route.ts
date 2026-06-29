import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import { getUserById } from "@/lib/users";
import { getExistingDailyReading, getOrCreateDailyReading } from "@/lib/daily-energy";
import { isCharacterKey } from "@/lib/prompts";
import { ensureSpreadCatalogSettingsLoaded } from "@/lib/spread-catalog-loader";
import { DEFAULT_SPREAD_ID, normalizeSpreadId } from "@/lib/spreads";

const EMPTY = { text: null, cards: [], system: null, drawn: false, spreadId: null as string | null };

export async function GET(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json(EMPTY);
  }

  await ensureSpreadCatalogSettingsLoaded();

  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) {
    return NextResponse.json(EMPTY);
  }

  const localDate = request.nextUrl.searchParams.get("date");
  const result = await getExistingDailyReading(userId, localDate);
  if (!result) {
    return NextResponse.json(EMPTY);
  }

  return NextResponse.json({
    text: result.text,
    cards: result.cards,
    system: result.system,
    drawn: true,
    spreadId: result.spreadId,
  });
}

export async function POST(request: NextRequest) {
  const auth = await requireUserAuth();
  if (!auth) {
    return NextResponse.json({ error: "auth_required" }, { status: 401 });
  }

  if (!(await ensureDb())) {
    return NextResponse.json(EMPTY);
  }

  await ensureSpreadCatalogSettingsLoaded();

  const userId = await getProfileUserIdForAccount(auth.sub);
  if (!userId) {
    return NextResponse.json(EMPTY);
  }

  const body = await request.json().catch(() => ({}));
  const requested = typeof body.characterKey === "string" ? body.characterKey : "veronika";
  const charKey = isCharacterKey(requested) ? requested : "veronika";
  const localDate = typeof body.localDate === "string" ? body.localDate : null;
  const spreadId =
    typeof body.spreadId === "string" ? normalizeSpreadId(body.spreadId) : DEFAULT_SPREAD_ID;

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json(EMPTY);
  }

  const result = await getOrCreateDailyReading({
    userId,
    characterKey: charKey,
    name: user.name,
    zodiac: user.zodiac,
    birthDate: user.birth_date,
    localDate,
    spreadId,
  });

  return NextResponse.json({
    text: result.text,
    cards: result.cards,
    system: result.system,
    drawn: true,
    spreadId: result.spreadId,
  });
}
