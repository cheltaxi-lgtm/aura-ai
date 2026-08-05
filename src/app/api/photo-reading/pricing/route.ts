import { NextResponse } from "next/server";
import { requireUserAuth } from "@/lib/require-auth";
import { getProfileUserIdForAccount } from "@/lib/accounts";
import {
  photoReadingPricingFromSettings,
  resolvePhotoReadingPricing,
} from "@/lib/photo-reading-billing";
import { getRuneSettings } from "@/lib/rune-settings";
import { isPhotoReadingEnabled } from "@/lib/settings";

export async function GET() {
  if (!(await isPhotoReadingEnabled())) {
    return NextResponse.json({ error: "Feature disabled" }, { status: 404 });
  }

  const auth = await requireUserAuth();
  if (!auth) {
    const settings = await getRuneSettings();
    const pricing = photoReadingPricingFromSettings(0, settings);
    return NextResponse.json({
      ...pricing,
      isLoggedIn: false,
    });
  }

  const profileUserId = await getProfileUserIdForAccount(auth.sub);
  if (!profileUserId) {
    const settings = await getRuneSettings();
    const pricing = photoReadingPricingFromSettings(0, settings);
    return NextResponse.json({ ...pricing, isLoggedIn: true });
  }

  const pricing = await resolvePhotoReadingPricing(profileUserId);
  return NextResponse.json({ ...pricing, isLoggedIn: true });
}
