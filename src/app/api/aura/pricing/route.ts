import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import {
  auraReadingPricingFromSettings,
  resolveAuraReadingPricing,
} from "@/lib/aura-reading-billing";
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
    });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    const settings = await getRuneSettings();
    const pricing = auraReadingPricingFromSettings(0, settings);
    return NextResponse.json(
      { ...pricing, isLoggedIn: true },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const pricing = await resolveAuraReadingPricing(profileUserId);
  return NextResponse.json(
    { ...pricing, isLoggedIn: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
