import { NextResponse } from "next/server";
import { getRecaptchaScopesConfig } from "@/lib/recaptcha";
import { getSetting } from "@/lib/settings";
import { isShareEnabled } from "@/lib/share/settings";

export async function GET() {
  const [features, recaptcha, shareEnabled] = await Promise.all([
    getSetting("features"),
    getRecaptchaScopesConfig(),
    isShareEnabled(),
  ]);

  return NextResponse.json({
    expertRegistrationEnabled: features.expertRegistrationEnabled !== false,
    shareEnabled,
    recaptcha: {
      configured: recaptcha.configured,
      masterEnabled: recaptcha.masterEnabled,
      scopes: recaptcha.scopes,
    },
  });
}
