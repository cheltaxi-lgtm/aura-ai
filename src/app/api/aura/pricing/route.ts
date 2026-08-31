import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import {
  auraReadingPricingFromSettings,
  hasTodaysUnrefundedAuraSpend,
  resolveAuraReadingPricing,
} from "@/lib/aura-reading-billing";
import { findTodaysPaidAuraReport } from "@/lib/aura-reading-persist";
import { getRuneSettings } from "@/lib/rune-settings";
import { isAuraReadingEnabled } from "@/lib/settings";

export async function GET() {
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

  const [pricing, todays, spentToday] = await Promise.all([
    resolveAuraReadingPricing(profileUserId),
    findTodaysPaidAuraReport(profileUserId),
    hasTodaysUnrefundedAuraSpend(profileUserId),
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
