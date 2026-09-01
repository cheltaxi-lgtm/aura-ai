import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import {
  auraReadingPricingFromSettings,
  auraSpendBelongsToSnapshot,
  hasTodaysUnrefundedAuraSpend,
  listTodaysUnrefundedAuraSpends,
  resolveAuraReadingPricing,
} from "@/lib/aura-reading-billing";
import { findTodaysPaidAuraReport } from "@/lib/aura-reading-persist";
import { listTodaysSnapshotIdsForSubject } from "@/lib/services/aura-guest-service";
import { getRuneSettings } from "@/lib/rune-settings";
import { isAuraOtherSubjectsEnabled, isAuraReadingEnabled } from "@/lib/settings";

export async function GET(request: Request) {
  if (!(await isAuraReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    const settings = await getRuneSettings();
    const pricing = auraReadingPricingFromSettings(0, settings);
    return NextResponse.json({
      ...pricing,
      isLoggedIn: false,
      todayPaid: false,
      todayHistoryId: null,
      todaySnapshotId: null,
    });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    const settings = await getRuneSettings();
    const pricing = auraReadingPricingFromSettings(0, settings);
    return NextResponse.json(
      {
        ...pricing,
        isLoggedIn: true,
        todayPaid: false,
        todayHistoryId: null,
        todaySnapshotId: null,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const othersOn = await isAuraOtherSubjectsEnabled();
  const subjectParam = othersOn ? new URL(request.url).searchParams.get("subject") : null;
  const subjectId =
    subjectParam && /^[0-9a-f-]{36}$/i.test(subjectParam) ? subjectParam : null;

  const [pricing, todays, spentToday] = await Promise.all([
    resolveAuraReadingPricing(profileUserId),
    findTodaysPaidAuraReport(profileUserId, othersOn ? subjectId : undefined),
    othersOn
      ? (async () => {
          const [spends, snapshotIds] = await Promise.all([
            listTodaysUnrefundedAuraSpends(profileUserId),
            listTodaysSnapshotIdsForSubject(profileUserId, subjectId),
          ]);
          return snapshotIds.some((id) => auraSpendBelongsToSnapshot(spends, id));
        })()
      : hasTodaysUnrefundedAuraSpend(profileUserId),
  ]);
  return NextResponse.json(
    {
      ...pricing,
      isLoggedIn: true,
      todayPaid: Boolean(todays) || spentToday,
      todayHistoryId: todays?.historyId ?? null,
      todaySnapshotId: todays?.snapshotId ?? null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
