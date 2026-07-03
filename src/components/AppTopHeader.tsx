"use client";

import { useLayoutEffect, useRef, useState } from "react";
import AppDownloadButton from "@/components/AppDownloadButton";
import AppHeaderMenu from "@/components/AppHeaderMenu";
import BrandLogo from "@/components/BrandLogo";
import AuthHeader from "@/components/AuthHeader";
import RuneBalance from "@/components/RuneBalance";
import TariffsModal from "@/components/TariffsModal";
import type { AuthUser } from "@/lib/useAuth";

export interface AppTopHeaderProps {
  photoNavLabel: string;
  isLoggedIn: boolean;
  authUser: AuthUser | null;
  authLoading: boolean;
  onOpenPaywall: () => void;
  onNavMasters: () => void;
  /** @deprecated Optional scroll fallback; modal always opens. */
  onNavTariffs?: () => void;
  onNavPhoto: () => void;
  onNavDecks: () => void;
  onStartReading: () => void;
}

export default function AppTopHeader({
  photoNavLabel,
  isLoggedIn,
  authUser,
  authLoading,
  onOpenPaywall,
  onNavMasters,
  onNavTariffs,
  onNavPhoto,
  onNavDecks,
  onStartReading,
}: AppTopHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [tariffsOpen, setTariffsOpen] = useState(false);

  const openTariffs = () => {
    onNavTariffs?.();
    setTariffsOpen(true);
  };

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const syncHeaderHeight = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      const prev = parseFloat(
        getComputedStyle(document.documentElement).getPropertyValue("--app-header-h")
      );
      if (Number.isFinite(prev) && Math.abs(height - prev) < 2) return;
      document.documentElement.style.setProperty("--app-header-h", `${height}px`);
    };

    syncHeaderHeight();
    const observer = new ResizeObserver(syncHeaderHeight);
    observer.observe(el);
    window.addEventListener("resize", syncHeaderHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncHeaderHeight);
    };
  }, []);

  return (
    <header
      ref={headerRef}
      className="app-top-header pointer-events-auto fixed top-0 left-0 right-0 border-b border-white/5 bg-black/80 backdrop-blur-md max-md:bg-[#080512] max-md:backdrop-blur-none"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-4">
        <div className="app-top-header__brand flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          <BrandLogo
            linkToHome
            iconOnlyOnMobile
            showTagline={false}
            markSize={32}
            titleClassName="font-display text-lg font-bold text-white neon-text sm:text-2xl"
          />
        </div>

        <nav className="app-top-header__nav hidden items-center gap-8 md:flex">
          <button
            type="button"
            onClick={onNavPhoto}
            className="relative z-[5010] text-sm text-gray-400 transition-colors hover:text-aura-neon"
          >
            {photoNavLabel}
          </button>
          <button
            type="button"
            onClick={onNavMasters}
            className="relative z-[5010] text-sm text-gray-400 transition-colors hover:text-aura-neon"
          >
            Мастера
          </button>
          <button
            type="button"
            onClick={onNavDecks}
            className="relative z-[5010] text-sm text-gray-400 transition-colors hover:text-aura-neon"
          >
            Колоды
          </button>
          <button
            type="button"
            onClick={openTariffs}
            className="relative z-[5010] text-sm text-gray-400 transition-colors hover:text-aura-neon"
          >
            Тарифы
          </button>
        </nav>

        {/* Desktop actions */}
        <div className="app-top-header__actions hidden shrink-0 items-center gap-2 md:flex md:gap-3">
          <AppDownloadButton compact />
          <button
            type="button"
            onClick={onStartReading}
            className="btn-primary relative z-[5010] inline-flex shrink-0 items-center px-4 py-2 text-sm"
          >
            Получить расклад
          </button>
          {isLoggedIn ? <RuneBalance onBuyClick={onOpenPaywall} /> : null}
          <AuthHeader user={authUser} loading={authLoading} />
        </div>

        {/* Mobile: logo + runes + menu */}
        <div className="app-top-header__mobile flex shrink-0 items-center gap-2 md:hidden">
          {isLoggedIn ? <RuneBalance compact onBuyClick={onOpenPaywall} /> : null}
          <AppHeaderMenu
            photoNavLabel={photoNavLabel}
            isLoggedIn={isLoggedIn}
            authUser={authUser}
            authLoading={authLoading}
            onNavMasters={onNavMasters}
            onNavDecks={onNavDecks}
            onNavPhoto={onNavPhoto}
            onNavTariffs={openTariffs}
            onStartReading={onStartReading}
          />
        </div>
      </div>
      <TariffsModal
        open={tariffsOpen}
        onClose={() => setTariffsOpen(false)}
        onOpenPaywall={onOpenPaywall}
        isLoggedIn={isLoggedIn}
      />
    </header>
  );
}
