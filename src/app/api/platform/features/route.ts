import { NextResponse } from "next/server";
import { getRecaptchaScopesConfig } from "@/lib/recaptcha";
import { getSetting } from "@/lib/settings";

export async function GET() {
  const [features, recaptcha] = await Promise.all([
    getSetting("features"),
    getRecaptchaScopesConfig(),
  ]);

  return NextResponse.json({
    expertRegistrationEnabled: features.expertRegistrationEnabled !== false,
    recaptcha: {
      configured: recaptcha.configured,
      masterEnabled: recaptcha.masterEnabled,
      scopes: recaptcha.scopes,
    },
  });
}
