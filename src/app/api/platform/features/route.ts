import { NextResponse } from "next/server";
import { getRecaptchaScopesConfig } from "@/lib/recaptcha";
import { listEnabledOAuthProviders } from "@/lib/oauth/config";
import { getSetting } from "@/lib/settings";

export async function GET() {
  const [features, recaptcha, oauthProviders] = await Promise.all([
    getSetting("features"),
    getRecaptchaScopesConfig(),
    Promise.resolve(listEnabledOAuthProviders()),
  ]);

  return NextResponse.json({
    expertRegistrationEnabled: features.expertRegistrationEnabled !== false,
    oauthProviders,
    recaptcha: {
      configured: recaptcha.configured,
      masterEnabled: recaptcha.masterEnabled,
      scopes: recaptcha.scopes,
    },
  });
}