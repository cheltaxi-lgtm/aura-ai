import { NextRequest, NextResponse } from "next/server";
import { ensureDb } from "@/lib/db";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount, resolveUnlimitedAccess } from "@/lib/accounts";
import {
  getAsyncJobWorkerUserId,
  isAsyncJobWorkerConfigured,
} from "@/lib/async-job-worker-auth";
import { enqueuePaidAsyncJob } from "@/lib/async-job-enqueue";
import {
  trackWorkerJobCompleted,
  trackWorkerJobFailed,
} from "@/lib/async-job-lifecycle";
import { getUserById } from "@/lib/users";
import {
  DailyReadingGenerationError,
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
  const workerUserId = getAsyncJobWorkerUserId(request);
  let accountId: string;
  let userId: string;

  if (workerUserId) {
    accountId = workerUserId;
    userId = workerUserId;
  } else {
    const auth = await requireUserAuth();
    if (!auth) {
      return NextResponse.json({ error: "auth_required" }, { status: 401 });
    }
    accountId = auth.sub;
    const profileId = await getProfileUserIdForAccount(auth.sub);
    if (!profileId) {
      return NextResponse.json(EMPTY);
    }
    userId = profileId;
  }

  if (!(await ensureDb())) {
    return NextResponse.json(EMPTY);
  }

  await ensureSpreadCatalogSettingsLoaded();

  const body = await request.json().catch(() => ({}));
  const rawBody = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  const asyncRequested = rawBody.async === true;
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
      const payload = {
        text: existing.text,
        cards: existing.cards,
        system: existing.system,
        drawn: true,
        spreadId: existing.spreadId,
        locked: false,
        purged: false,
        reused: true,
      };
      await trackWorkerJobCompleted(request, payload);
      return NextResponse.json(payload);
    }
  }

  if (asyncRequested && isAsyncJobWorkerConfigured() && !workerUserId) {
    const kind = spreadId === "daily-extended" ? "daily_extended" : "daily_reading";
    return enqueuePaidAsyncJob({
      userId,
      kind,
      payload: {
        ...rawBody,
        async: false,
        readingDate: localDate,
        variant: spreadId,
        spreadId,
        characterKey: charKey,
        localDate,
      },
      bypassDeliveryGate: true,
    });
  }

  const user = await getUserById(userId);
  if (!user) {
    return NextResponse.json(EMPTY);
  }

  const unlimited = await resolveUnlimitedAccess({ accountId, profileUserId: userId });
  const runeSettings = await getRuneSettings();
  const useRuneBilling = isRuneBillingActive(userId, unlimited, runeSettings);

  const needsExtendedCharge =
    spreadId === "daily-extended" &&
    useRuneBilling &&
    (!existing || normalizeSpreadId(existing.spreadId) !== "daily-extended");

  let extendedCharge: Awaited<ReturnType<typeof BillingService.chargeRuneAction>> | null =
    null;

  if (needsExtendedCharge) {
    try {
      extendedCharge = await BillingService.chargeRuneAction({
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

    const payload = {
      text: result.text,
      cards: result.cards,
      system: result.system,
      drawn: true,
      spreadId: result.spreadId,
      locked: false,
      purged: false,
    };
    await trackWorkerJobCompleted(request, payload);
    return NextResponse.json(payload);
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
    if (err instanceof DailyReadingGenerationError) {
      let refunded = false;
      if (extendedCharge && extendedCharge.spentRunes > 0) {
        try {
          await BillingService.rollbackCharge({
            userId,
            cost: extendedCharge.spentRunes,
            wasFreeQuestion: extendedCharge.wasFreeQuestion,
            actionType: "DAILY_EXTENDED",
            transactionId: extendedCharge.transactionId,
          });
          refunded = true;
        } catch (refundErr) {
          console.error("Daily extended refund failed:", refundErr);
        }
      }
      await trackWorkerJobFailed(request, "Daily reading generation failed", {
        refunded,
        errorCode: "generation_failed",
      });
      return NextResponse.json(
        {
          error: "Не удалось получить трактовку. Руны возвращены. Попробуйте ещё раз.",
          code: "generation_failed",
          refunded,
        },
        { status: 502 }
      );
    }
    throw err;
  }
}
