"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AstrologyWorkspace from "@/components/natal/AstrologyWorkspace";
import { useAuth } from "@/lib/useAuth";

export default function CabinetAstrologyPage() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/user/login?returnTo=" + encodeURIComponent("/cabinet/astrology"));
    }
  }, [loading, router, user]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#09070d] text-sm text-white/50">
        Проверяем доступ…
      </main>
    );
  }

  return <AstrologyWorkspace />;
}
