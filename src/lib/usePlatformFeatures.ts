"use client";

import { useEffect, useState } from "react";

export interface PlatformFeatures {
  expertRegistrationEnabled: boolean;
}

const FALLBACK: PlatformFeatures = {
  expertRegistrationEnabled: true,
};

let cached: PlatformFeatures | null = null;
let inflight: Promise<PlatformFeatures> | null = null;

export function fetchPlatformFeatures(): Promise<PlatformFeatures> {
  if (cached) return Promise.resolve(cached);
  if (inflight) return inflight;

  inflight = fetch("/api/platform/features")
    .then((r) => (r.ok ? r.json() : FALLBACK))
    .then((d) => {
      const config: PlatformFeatures = {
        expertRegistrationEnabled: d.expertRegistrationEnabled !== false,
      };
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
