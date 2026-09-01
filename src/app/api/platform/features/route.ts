import { NextResponse } from "next/server";
import { getRecaptchaScopesConfig } from "@/lib/recaptcha";
import { listEnabledOAuthProviders } from "@/lib/oauth/config";
import {
  getSetting,
  isAuraOtherSubjectsEnabled,
  isAuraReadingEnabled,
  isHumanDesignEnabled,
  isJointReadingEnabled,
  isNatalChartEnabled,
  isPhotoReadingEnabled,
} from "@/lib/settings";
import { getRitualSettings, isRitualCatalogEnabled } from "@/lib/ritual-settings";
import { isProModuleEnabled } from "@/modules/pro/config";

export async function GET() {
  const [
    features,
    recaptcha,
    oauthProviders,
    natalChartEnabled,
    jointReadingEnabled,
    humanDesignEnabled,
    photoReadingEnabled,
    auraReadingEnabled,
    auraOtherSubjectsEnabled,
    ritualSettings,
  ] = await Promise.all([
    getSetting("features"),
    getRecaptchaScopesConfig(),
    Promise.resolve(listEnabledOAuthProviders()),
    isNatalChartEnabled(),
    isJointReadingEnabled(),
    isHumanDesignEnabled(),
    isPhotoReadingEnabled(),
    isAuraReadingEnabled(),
    isAuraOtherSubjectsEnabled(),
    getRitualSettings(),
  ]);

  return NextResponse.json({
    expertRegistrationEnabled: features.expertRegistrationEnabled !== false,
    natalChartEnabled,
    jointReadingEnabled,
    humanDesignEnabled,
    photoReadingEnabled,
    auraReadingEnabled,
    auraOtherSubjectsEnabled,
    ritualsEnabled: isRitualCatalogEnabled(ritualSettings),
    proModuleEnabled: isProModuleEnabled(),
    oauthProviders,
    recaptcha: {
      configured: recaptcha.configured,
      masterEnabled: recaptcha.masterEnabled,
      scopes: recaptcha.scopes,
    },
  });
}