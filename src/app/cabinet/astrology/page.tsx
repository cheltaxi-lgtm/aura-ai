"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import AppTopHeader from "@/components/AppTopHeader";
import AstrologyWorkspace from "@/components/natal/AstrologyWorkspace";
import { usePaywall } from "@/contexts/PaywallContext";
import {
  APP_SHELL_SECTIONS,
  navigateToAppSection,
  navigateToDecksModal,
  navigateToHomeSpreadFlow,
  navigateToPhotoReading,
  navigateToRitualFlow,
} from "@/lib/app-shell-nav";
import { useAuth } from "@/lib/useAuth";
import { useRuneConfig } from "@/lib/useRuneConfig";

export default function CabinetAstrologyPage() {
  const router = useRouter();
  const { openPaywall } = usePaywall();
  const { user: authUser, loading: authLoading } = useAuth();
  const { config: runeConfig, formatRunes, cost: runeCost } = useRuneConfig();
  const [headerMounted, setHeaderMounted] = useState(false);

  useEffect(() => {
    setHeaderMounted(true);
  }, []);

  useEffect(() => {
    if (!authLoading && !authUser) {
      const returnTo =
        typeof window === "undefined"
          ? "/cabinet/astrology"
          : `${window.location.pathname}${window.location.search}${window.location.hash}`;
      router.replace("/auth/user/login?returnTo=" + encodeURIComponent(returnTo));
    }
  }, [authLoading, authUser, router]);

  const photoNavLabel = runeConfig.enabled
    ? `Фото · ${formatRunes(runeCost("VISION_ANALYSIS"))}`
    : "Фото расклад";

  const topHeader =
    authUser && headerMounted ? (
      <AppTopHeader
        photoNavLabel={photoNavLabel}
        isLoggedIn
        authUser={authUser}
        authLoading={authLoading}
        onOpenPaywall={() => openPaywall()}
        onNavMasters={() => navigateToAppSection(APP_SHELL_SECTIONS.masters)}
        onNavTariffs={() => navigateToAppSection(APP_SHELL_SECTIONS.tariffs)}
        onNavPhoto={() => navigateToPhotoReading()}
        onNavDecks={() => navigateToDecksModal()}
        onNavRitual={() => navigateToRitualFlow()}
        onStartReading={() => navigateToHomeSpreadFlow()}
      />
    ) : null;

  const shellClassName =
    "min-h-screen bg-[#09070d] pb-16 pt-[var(--app-header-h,3.25rem)] text-white";

  if (authLoading || !authUser) {
    return (
      <div className={shellClassName}>
        {topHeader ? createPortal(topHeader, document.body) : null}
        <main className="flex min-h-[50vh] items-center justify-center text-sm text-white/50">
          Проверяем доступ…
        </main>
      </div>
    );
  }

  return (
    <div className={shellClassName}>
      {topHeader ? createPortal(topHeader, document.body) : null}
      <AstrologyWorkspace />
    </div>
  );
}
