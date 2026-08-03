"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import AppTopHeader from "@/components/AppTopHeader";
import {
  APP_SHELL_SECTIONS,
  navigateToAppSection,
  navigateToDecksModal,
  navigateToPhotoReading,
  navigateToRitualFlow,
  navigateToStartReading,
} from "@/lib/app-shell-nav";
import { usePaywallOptional } from "@/contexts/PaywallContext";
import { useAuth } from "@/lib/useAuth";
import { useRuneConfig } from "@/lib/useRuneConfig";

function isAdminPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Single site chrome header for all public routes (admin excluded). */
export default function GlobalAppTopHeader() {
  const pathname = usePathname();
  const { isLoggedIn, loading: authLoading, user: authUser } = useAuth();
  const paywall = usePaywallOptional();
  const { config: runeConfig, cost: runeCost, formatRunes } = useRuneConfig();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isAdminPath(pathname)) {
      document.body.classList.remove("has-site-header");
      return;
    }
    document.body.classList.add("has-site-header");
    return () => document.body.classList.remove("has-site-header");
  }, [pathname]);

  if (!mounted || typeof document === "undefined") return null;
  if (isAdminPath(pathname)) return null;

  const photoNavLabel = runeConfig.enabled
    ? `Фото · ${formatRunes(runeCost("VISION_ANALYSIS"))}`
    : "Фото расклад";

  return createPortal(
    <AppTopHeader
      photoNavLabel={photoNavLabel}
      isLoggedIn={isLoggedIn}
      authUser={authUser}
      authLoading={authLoading}
      onOpenPaywall={() => paywall?.openPaywall()}
      onNavMasters={() => navigateToAppSection(APP_SHELL_SECTIONS.masters)}
      onNavTariffs={() => navigateToAppSection(APP_SHELL_SECTIONS.tariffs)}
      onNavPhoto={() => navigateToPhotoReading()}
      onNavDecks={() => navigateToDecksModal()}
      onNavRitual={() => navigateToRitualFlow()}
      onStartReading={() => navigateToStartReading()}
    />,
    document.body
  );
}
