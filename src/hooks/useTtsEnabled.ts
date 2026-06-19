"use client";

import { useEffect, useState } from "react";

let cachedEnabled: boolean | null = null;
let inflight: Promise<boolean> | null = null;

async function fetchTtsEnabled(): Promise<boolean> {
  if (cachedEnabled !== null) return cachedEnabled;
  if (inflight) return inflight;

  inflight = fetch("/api/tts", { credentials: "same-origin" })
    .then(async (res) => {
      const data = (await res.json()) as { enabled?: boolean };
      cachedEnabled = data.enabled === true;
      return cachedEnabled;
    })
    .catch(() => {
      cachedEnabled = false;
      return false;
    })
    .finally(() => {
      inflight = null;
    });

  return inflight;
}

export function useTtsEnabled(): boolean | null {
  const [enabled, setEnabled] = useState<boolean | null>(cachedEnabled);

  useEffect(() => {
    if (cachedEnabled !== null) {
      setEnabled(cachedEnabled);
      return;
    }
    void fetchTtsEnabled().then(setEnabled);
  }, []);

  return enabled;
}

export function invalidateTtsEnabledCache() {
  cachedEnabled = null;
}
