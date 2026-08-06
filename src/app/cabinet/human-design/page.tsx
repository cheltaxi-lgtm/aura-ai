"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import HdCabinet from "@/components/human-design/HdCabinet";
import { navigateToBirthProfileOnboarding } from "@/lib/app-shell-nav";
import { useAuth } from "@/lib/useAuth";

export default function CabinetHumanDesignPage() {
  const router = useRouter();
  const { user: authUser, loading: authLoading } = useAuth();

  useEffect(() => {
    if (!authLoading && !authUser) {
      const returnTo =
        typeof window === "undefined"
          ? "/cabinet/human-design"
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
    "min-h-screen bg-[#0a0908] pb-16 pt-[var(--app-header-h,3.25rem)] text-white";

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
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <HdCabinet />
      </main>
    </div>
  );
}
