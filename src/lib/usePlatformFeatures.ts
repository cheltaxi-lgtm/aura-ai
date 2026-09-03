"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_RECAPTCHA_SCOPES,
  type RecaptchaScopeSettings,
} from "@/lib/recaptcha-scopes";

export interface PlatformRecaptchaConfig {
  configured: boolean;
  masterEnabled: boolean;
  scopes: RecaptchaScopeSettings;
}

export interface PlatformFeatures {
  expertRegistrationEnabled: boolean;
  /** Optional — older call sites construct features without it. */
  humanDesignEnabled?: boolean;
  natalChartEnabled?: boolean;
  jointReadingEnabled?: boolean;
  ritualsEnabled?: boolean;
  photoReadingEnabled?: boolean;
  /** Aura reading by photo (ENV kill-switch, fail-closed). */
  auraReadingEnabled?: boolean;
  /** Other-person aura slots (ENV kill-switch, default off). */
  auraOtherSubjectsEnabled?: boolean;
  /** Palm reading by photo (ENV kill-switch, fail-closed). */
  palmReadingEnabled?: boolean;
  /** Zovus Pro practitioner module (ENV kill-switch). */
  proModuleEnabled?: boolean;
  recaptcha: PlatformRecaptchaConfig;
}

const FALLBACK_SCOPES = Object.fromEntries(
  (Object.keys(DEFAULT_RECAPTCHA_SCOPES) as (keyof RecaptchaScopeSettings)[]).map((scope) => [
    scope,
    false,
  ])
) as RecaptchaScopeSettings;

const FALLBACK: PlatformFeatures = {
  expertRegistrationEnabled: true,
  humanDesignEnabled: false,
  natalChartEnabled: false,
  jointReadingEnabled: true,
  ritualsEnabled: true,
  photoReadingEnabled: true,
  auraReadingEnabled: false,
  auraOtherSubjectsEnabled: false,
  palmReadingEnabled: false,
  proModuleEnabled: false,
  recaptcha: {
    configured: false,
    masterEnabled: false,
    scopes: FALLBACK_SCOPES,
  },
};

let cached: PlatformFeatures | null = null;
let inflight: Promise<PlatformFeatures> | null = null;

function parseFeatures(d: Record<string, unknown>): PlatformFeatures {
  const recaptchaRaw = (d.recaptcha ?? {}) as Record<string, unknown>;
  const scopesRaw = (recaptchaRaw.scopes ?? {}) as Partial<RecaptchaScopeSettings>;

  return {
    expertRegistrationEnabled: d.expertRegistrationEnabled !== false,
    // HD defaults on in product; require explicit true from API (matches prior client parse).
    humanDesignEnabled: d.humanDesignEnabled === true,
    // Natal is opt-in (platform default false).
    natalChartEnabled: d.natalChartEnabled === true,
    jointReadingEnabled: d.jointReadingEnabled !== false,
    ritualsEnabled: d.ritualsEnabled !== false,
    photoReadingEnabled: d.photoReadingEnabled !== false,
    auraReadingEnabled: d.auraReadingEnabled === true,
    auraOtherSubjectsEnabled: d.auraOtherSubjectsEnabled === true,
    palmReadingEnabled: d.palmReadingEnabled === true,
    proModuleEnabled: d.proModuleEnabled === true,
    recaptcha: {
      configured: recaptchaRaw.configured === true,
      masterEnabled: recaptchaRaw.masterEnabled === true,
      scopes: { ...DEFAULT_RECAPTCHA_SCOPES, ...scopesRaw },
    },
  };
}

export function fetchPlatformFeatures(): Promise<PlatformFeatures> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = fetch("/api/platform/features")
    .then((r) => (r.ok ? r.json() : FALLBACK))
    .then((d) => {
      const config = parseFeatures(d as Record<string, unknown>);
      cached = config;
      return config;
    })
    .catch(() => FALLBACK)
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function invalidatePlatformFeaturesCache() {
  cached = null;
}

export function usePlatformFeatures() {
  // The first client render must match SSR, even if another mounted consumer
  // populated the module cache before this Suspense boundary hydrated.
  const [features, setFeatures] = useState<PlatformFeatures>(FALLBACK);
  const [featuresLoaded, setFeaturesLoaded] = useState(false);

  useEffect(() => {
    void fetchPlatformFeatures().then((next) => {
      setFeatures(next);
      setFeaturesLoaded(true);
    });
  }, []);

  return { ...features, featuresLoaded };
}
