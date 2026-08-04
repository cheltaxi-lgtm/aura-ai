import { NextResponse } from "next/server";
import { getRecaptchaScopesConfig } from "@/lib/recaptcha";
import { listEnabledOAuthProviders } from "@/lib/oauth/config";
import { getSetting, isHumanDesignEnabled, isJointReadingEnabled, isNatalChartEnabled } from "@/lib/settings";

export async function GET() {
  const [features, recaptcha, oauthProviders, natalChartEnabled, jointReadingEnabled, humanDesignEnabled] = await Promise.all([
    getSetting("features"),
    getRecaptchaScopesConfig(),
    Promise.resolve(listEnabledOAuthProviders()),
    isNatalChartEnabled(),
    isJointReadingEnabled(),
    isHumanDesignEnabled(),
  ]);

  return NextResponse.json({
    expertRegistrationEnabled: features.expertRegistrationEnabled !== false,
    natalChartEnabled,
    jointReadingEnabled,
    humanDesignEnabled,
    oauthProviders,
    recaptcha: {
      configured: recaptcha.configured,
      masterEnabled: recaptcha.masterEnabled,
      scopes: recaptcha.scopes,
    },
  });
}