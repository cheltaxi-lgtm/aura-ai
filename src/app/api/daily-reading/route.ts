import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import { getUserById } from "@/lib/users";
import {
  DailyReadingLockedError,
  getExistingDailyReading,
  getOrCreateDailyReading,
} from "@/lib/daily-energy";
import { isDailyReadingUsedToday } from "@/lib/rate-limit-anchors";
import { isCharacterKey } from "@/lib/prompts";
import { ensureSpreadCatalogSettingsLoaded } from "@/lib/spread-catalog-loader";
import { DEFAULT_SPREAD_ID, isSpreadEnabled, normalizeSpreadId } from "@/lib/spreads";
import { isRuneBillingActive } from "@/lib/rune-service";
import { getRuneSettings } from "@/lib/rune-settings";
import {
  BillingService,
  InsufficientFundsError,
  insufficientFundsResponse,
} from "@/lib/services/billing-service";

const EMPTY = {
  text: null,
  cards: [],
  system: null,
  drawn: false,
  spreadId: null as string | null,
  locked: false,
  purged: false,
};

function resolveLocalDate(raw: string | null | undefined): string {
  if (typeof raw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return new Date().toISOString().slice(0, 10);
}

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

  const localDate = resolveLocalDate(request.nextUrl.searchParams.get("date"));
  const result = await getExistingDailyReading(userId, localDate);
  if (result) {
    return NextResponse.json({
      text: result.text,
      cards: result.cards,
      system: result.system,
      drawn: true,
      spreadId: result.spreadId,
      locked: false,
      purged: false,
    });
  }

  const usage = await isDailyReadingUsedToday(userId, localDate);
  if (usage.used && !usage.hasContent) {
    return NextResponse.json({
      ...EMPTY,
      drawn: true,
      locked: true,
      purged: true,
      spreadId: usage.spreadId,
    });
  }

  return NextResponse.json(EMPTY);
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
  const localDate = resolveLocalDate(typeof body.localDate === "string" ? body.localDate : null);
  const requestedSpreadId =
    typeof body.spreadId === "string" ? normalizeSpreadId(body.spreadId) : DEFAULT_SPREAD_ID;
  let spreadId: typeof requestedSpreadId =
    requestedSpreadId === "daily-extended" ? "daily-extended" : DEFAULT_SPREAD_ID;
  if (spreadId === "daily-extended" && !isSpreadEnabled("daily-extended")) {
    spreadId = DEFAULT_SPREAD_ID;
  }

  const usage = await isDailyReadingUsedToday(userId, localDate);
  if (usage.used && !usage.hasContent) {
    return NextResponse.json(
      {
        error: "daily_reading_locked",
        message: "Расклад на сегодня уже был — новый будет доступен завтра.",
        spreadId: usage.spreadId,
        locked: true,
      },
      { status: 403 }
    );
  }

  const existing = await getExistingDailyReading(userId, localDate);
  if (existing) {
    const existingSpreadId = normalizeSpreadId(existing.spreadId);
    if (
      existingSpreadId === spreadId ||
      existingSpreadId === "daily-extended"
    ) {
      return NextResponse.json({
        text: existing.text,
        cards: existing.cards,
        system: existing.system,
        drawn: true,
        spreadId: existing.spreadId,
        locked: false,
        purged: false,
      });
    }
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json(EMPTY);
  }

  const unlimited = await resolveUnlimitedAccess({ accountId: auth.sub, profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(userId, unlimited, runeSettings);

  const needsExtendedCharge =
    spreadId === "daily-extended" &&
    useRuneBilling &&
    (!existing || normalizeSpreadId(existing.spreadId) !== "daily-extended");

  if (needsExtendedCharge) {
    try {
      await BillingService.chargeRuneAction({
        userId,
        action: "DAILY_EXTENDED",
      });
    } catch (err) {
      if (err instanceof InsufficientFundsError) {
        return insufficientFundsResponse(err);
      }
      throw err;
    }
  }

  try {
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
      locked: false,
      purged: false,
    });
  } catch (err) {
    if (err instanceof DailyReadingLockedError) {
      return NextResponse.json(
        {
          error: "daily_reading_locked",
          message: "Расклад на сегодня уже был — новый будет доступен завтра.",
          spreadId: err.spreadId,
          locked: true,
        },
        { status: 403 }
      );
    }
    throw err;
  }
}
