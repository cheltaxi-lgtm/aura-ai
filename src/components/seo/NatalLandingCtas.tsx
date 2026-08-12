"use client";

import { useEffect, useState } from "react";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { useAuth } from "@/lib/useAuth";

const WORKSPACE = "/cabinet/astrology";
const CALCULATOR = "#natal-calculator";

function hasPendingNatalClaimIntent(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem("natal:pending-claim") === "1") return true;
  } catch {
    /* ignore */
  }
  return new URLSearchParams(window.location.search).get("resumeNatal") === "1";
}

/**
 * Hero CTA scrolls guests to the on-page calculator.
 * Logged-in auto-redirect to workspace is deferred while a guest Natal claim is pending.
 */
export default function NatalLandingCtas({ placement }: { placement: "hero" | "footer" }) {
  const { isLoggedIn, loading } = useAuth();
  const [pendingClaim, setPendingClaim] = useState(false);

  useEffect(() => {
    setPendingClaim(hasPendingNatalClaimIntent());
  }, []);

  useEffect(() => {
    if (loading || !isLoggedIn) return;
    if (placement !== "hero") return;
    // Claim runs in NatalGuestCalculator first — do not yank the page away.
    if (pendingClaim || hasPendingNatalClaimIntent()) return;
    window.location.replace(WORKSPACE);
  }, [isLoggedIn, loading, placement, pendingClaim]);

  if (placement === "footer") {
    return (
      <div className="mt-10 flex flex-wrap gap-3">
        <SeoTrackedCta
          href={isLoggedIn && !pendingClaim ? WORKSPACE : CALCULATOR}
          trackGoal="natal_landing_cta_click"
        >
          {isLoggedIn && !pendingClaim
            ? "Открыть астрологию в кабинете"
            : "Построить мою карту"}
        </SeoTrackedCta>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <SeoTrackedCta
        href={isLoggedIn && !pendingClaim ? WORKSPACE : CALCULATOR}
        trackGoal="natal_landing_cta_click"
      >
        {isLoggedIn && !pendingClaim ? "Открыть натальную карту" : "Построить мою карту"}
      </SeoTrackedCta>
    </div>
  );
}
