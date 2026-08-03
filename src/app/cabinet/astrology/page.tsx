"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AstrologyWorkspace from "@/components/natal/AstrologyWorkspace";
import { navigateToBirthProfileOnboarding } from "@/lib/app-shell-nav";
import { useAuth } from "@/lib/useAuth";

export default function CabinetAstrologyPage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !authUser) {
      const returnTo =
        typeof window === "undefined"
          ? "/cabinet/astrology"
          : `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.replace("/auth/user/login?returnTo=" + encodeURIComponent(returnTo));
    }
  }, [authLoading, authUser, router]);

  useEffect(() => {
    if (!authLoading && authUser && !authUser.profileUserId) {
      navigateToBirthProfileOnboarding();
    }
  }, [authLoading, authUser]);

  const shellClassName =
    "min-h-screen bg-[#09070d] pb-16 pt-[var(--app-header-h,3.25rem)] text-white";

  if (authLoading || !authUser) {
    return (
      <div className={shellClassName}>
        <main className="flex min-h-[50vh] items-center justify-center text-sm text-white/50">
          Проверяем доступ…
        </main>
      </div>
    );
  }

  return (
    <div className={shellClassName}>
      <AstrologyWorkspace />
    </div>
  );
}
