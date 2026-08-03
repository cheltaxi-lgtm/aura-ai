"use client";

import { useEffect, useState } from "react";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

/**
 * If the user already has a valid session, skip the login/register wall
 * and continue to returnTo (e.g. /cabinet/astrology).
 */
export default function AuthSessionResume({
  role = "user",
  fallback = "/",
}: {
  role?: "user" | "expert" | "admin";
  fallback?: string;
}) {
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithTimeout("/api/auth/me", {
          credentials: "include",
          cache: "no-store",
          timeoutMs: 8_000,
        });
        const data = (await res.json().catch(() => null)) as {
          authenticated?: boolean;
          user?: { role?: string };
        } | null;
        if (cancelled) return;
        if (data?.authenticated && data.user?.role === role) {
          const params = new URLSearchParams(window.location.search);
          const raw = params.get("returnTo") ?? params.get("next");
          const dest = sanitizeReturnTo(raw, fallback);
          window.location.replace(dest);
          return;
        }
      } catch {
        /* stay on auth form */
      }
      if (!cancelled) setChecking(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [fallback, role]);

  if (!checking) return null;

  return (
    <p className="mb-4 text-center text-sm text-white/50" role="status">
      Проверяем сессию…
    </p>
  );
}
