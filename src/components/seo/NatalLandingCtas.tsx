"use client";

import { useEffect } from "react";
import SeoTrackedCta from "@/components/seo/SeoTrackedCta";
import { useAuth } from "@/lib/useAuth";

const WORKSPACE = "/cabinet/astrology";
const REGISTER = `/auth/user/register?returnTo=${encodeURIComponent(WORKSPACE)}`;
const LOGIN = `/auth/user/login?returnTo=${encodeURIComponent(WORKSPACE)}`;

/**
 * Logged-in users must never be sent through register/login for natal —
 * the SEO landing used to always hard-link to auth walls.
 */
export default function NatalLandingCtas({ placement }: { placement: "hero" | "footer" }) {
  const { isLoggedIn, loading } = useAuth();

  useEffect(() => {
    if (loading || !isLoggedIn) return;
    // Deep-link from menu/SEO while already signed in → open workspace.
    if (placement !== "hero") return;
    window.location.replace(WORKSPACE);
  }, [isLoggedIn, loading, placement]);

  if (placement === "footer") {
    return (
      <div className="mt-10 flex flex-wrap gap-3">
        <SeoTrackedCta
          href={isLoggedIn ? WORKSPACE : REGISTER}
          trackGoal="natal_landing_cta_click"
        >
          Открыть астрологию в кабинете
        </SeoTrackedCta>
      </div>
    );
  }

  return (
    <div className="mt-8 flex flex-wrap gap-3">
      <SeoTrackedCta
        href={isLoggedIn ? WORKSPACE : REGISTER}
        trackGoal="natal_landing_cta_click"
      >
        {isLoggedIn ? "Открыть натальную карту" : "Рассчитать натальную карту"}
      </SeoTrackedCta>
      {!isLoggedIn ? (
        <SeoTrackedCta href={LOGIN} variant="ghost" trackGoal="natal_landing_login_click">
          Уже есть аккаунт
        </SeoTrackedCta>
      ) : null}
    </div>
  );
}
