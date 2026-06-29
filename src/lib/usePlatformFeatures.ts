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
  recaptcha: PlatformRecaptchaConfig;
}

const FALLBACK: PlatformFeatures = {
  expertRegistrationEnabled: true,
  recaptcha: {
    configured: false,
    masterEnabled: false,
    scopes: { ...DEFAULT_RECAPTCHA_SCOPES },
  },
};

let cached: PlatformFeatures | null = null;
let inflight: Promise<PlatformFeatures> | null = null;

function parseFeatures(d: Record<string, unknown>): PlatformFeatures {
  const recaptchaRaw = (d.recaptcha ?? {}) as Record<string, unknown>;
  const scopesRaw = (recaptchaRaw.scopes ?? {}) as Partial<RecaptchaScopeSettings>;

  return {
    expertRegistrationEnabled: d.expertRegistrationEnabled !== false,
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
  const [features, setFeatures] = useState<PlatformFeatures>(cached ?? FALLBACK);

  useEffect(() => {
    void fetchPlatformFeatures().then(setFeatures);
  }, []);

  return features;
}
