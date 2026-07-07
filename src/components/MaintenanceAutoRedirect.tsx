"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** If maintenance was turned off, leave this page (bookmark / stale redirect). */
export default function MaintenanceAutoRedirect() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/platform/status", { cache: "no-store" })
      .then((res) => res.json().catch(() => null))
      .then((data: { maintenanceMode?: boolean } | null) => {
        if (cancelled || data?.maintenanceMode === true) return;
        router.replace("/");
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [router]);

  return null;
}
