"use client";

import {
  navigateToAppHome,
  navigateToAppSection,
  navigateToBirthProfileOnboarding,
  navigateToCabinet,
  navigateToDecksModal,
  navigateToHomeSpreadFlow,
  navigateToPhotoReading,
  navigateToRitualFlow,
  navigateToSpreadCatalog,
  navigateToStartReading,
} from "@/lib/app-shell-nav";

/** Thin hook wrapper — navigation uses plain functions safe for Capacitor WebView. */
export function useAppShellNav() {
  return {
    navigateToBirthProfileOnboarding,
    navigateToAppSection,
    navigateToAppHome,
    navigateToHomeSpreadFlow,
    navigateToStartReading,
    navigateToSpreadCatalog,
    navigateToPhotoReading,
    navigateToDecksModal,
    navigateToCabinet,
    navigateToRitualFlow,
  };
}
