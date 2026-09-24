"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import AppTopHeader from "@/components/AppTopHeader";
import BrandLogo from "@/components/BrandLogo";
import { BRAND_LOGO_HEADER } from "@/lib/brand";
import {
  APP_SHELL_SECTIONS,
  navigateToAppSection,
  navigateToDecksModal,
  navigateToPhotoReading,
  navigateToRitualFlow,
  navigateToStartReading,
  resolveAppAwarePath,
} from "@/lib/app-shell-nav";
import { usePaywallOptional } from "@/contexts/PaywallContext";
import { useAuth } from "@/lib/useAuth";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { resolveProductHeaderAction } from "@/lib/product-header-action";

function isAdminPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/admin" || pathname.startsWith("/admin/");
}

/** Client report links — keep chrome out of the reading surface. */
function isProPublicReportPath(pathname: string | null): boolean {
  if (!pathname) return false;
  return pathname === "/r" || pathname.startsWith("/r/");
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
    if (isAdminPath(pathname) || isProPublicReportPath(pathname)) {
      document.body.classList.remove("has-site-header");
      return;
    }
    document.body.classList.add("has-site-header");
    return () => document.body.classList.remove("has-site-header");
  }, [pathname]);

  if (isAdminPath(pathname) || isProPublicReportPath(pathname)) return null;

  /* Pre-mount: paint the chrome shell immediately (SSR) so the header doesn't
     flash in after hydration; the portal swap reuses the same layout. */
  if (!mounted || typeof document === "undefined") {
    return (
      <header
        aria-hidden
        className="app-top-header fixed top-0 left-0 right-0 border-b border-white/5 bg-black/80 backdrop-blur-md max-md:bg-[#0a0908] max-md:backdrop-blur-none"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-4 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
          <div className="app-top-header__brand flex shrink-0 items-center">
            <BrandLogo {...BRAND_LOGO_HEADER} />
          </div>
        </div>
      </header>
    );
  }

  const photoNavLabel = runeConfig.enabled
    ? `Фото · ${formatRunes(runeCost("VISION_ANALYSIS"))}`
    : "Фото расклад";
  const productAction = resolveProductHeaderAction(pathname);
  const handlePrimaryAction = () => {
    if (!productAction) {
      navigateToStartReading();
      return;
    }
    if (productAction.target?.startsWith("#")) {
      const target = document.querySelector<HTMLElement>(productAction.target);
      if (target) {
        const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        target.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
        if (!target.hasAttribute("tabindex")) target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
      return;
    }
    if (productAction.target) {
      window.location.assign(productAction.target);
      return;
    }
    const target = document.querySelector<HTMLElement>(
      "[data-product-primary], main h1, main"
    );
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    target?.focus?.({ preventScroll: true });
  };

  return createPortal(
    <AppTopHeader
      photoNavLabel={photoNavLabel}
      isLoggedIn={isLoggedIn}
      authUser={authUser}
      authLoading={authLoading}
      onOpenPaywall={() => paywall?.openPaywall()}
      onNavMasters={() => navigateToAppSection(APP_SHELL_SECTIONS.masters)}
      onNavTariffs={() => window.location.assign(resolveAppAwarePath("/tariffs"))}
      onNavPhoto={() => navigateToPhotoReading()}
      onNavDecks={() => navigateToDecksModal()}
      onNavRitual={() => navigateToRitualFlow()}
      onStartReading={handlePrimaryAction}
      primaryActionLabel={productAction?.desktopLabel}
      primaryActionMobileLabel={productAction?.mobileLabel}
    />,
    document.body
  );
}
