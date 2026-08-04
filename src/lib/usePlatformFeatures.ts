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
    humanDesignEnabled: d.humanDesignEnabled === true,
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
  const [featuresLoaded, setFeaturesLoaded] = useState(cached !== null);

  useEffect(() => {
    void fetchPlatformFeatures().then((next) => {
      setFeatures(next);
      setFeaturesLoaded(true);
    });
  }, []);

  return { ...features, featuresLoaded };
}
