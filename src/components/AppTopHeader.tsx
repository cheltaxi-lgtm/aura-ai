"use client";

import { useLayoutEffect, useRef } from "react";
import { Camera, Layers } from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import AuthHeader from "@/components/AuthHeader";
import RuneBalance from "@/components/RuneBalance";
import type { AuthUser } from "@/lib/useAuth";

export interface AppTopHeaderProps {
  photoNavLabel: string;
  isLoggedIn: boolean;
  authUser: AuthUser | null;
  authLoading: boolean;
  onOpenPaywall: () => void;
  onNavMasters: () => void;
  onNavTariffs: () => void;
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

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const syncHeaderHeight = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
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
      className="app-top-header pointer-events-auto fixed top-0 left-0 right-0 border-b border-white/5 bg-black/80 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-6 sm:py-4">
        <div className="app-top-header__brand flex shrink-0 items-center gap-1.5 sm:gap-2">
          <BrandLogo
            linkToHome
            iconOnlyOnMobile
            showTagline={false}
            markSize={32}
            titleClassName="font-display text-lg font-bold tracking-wider text-white neon-text sm:text-2xl"
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
            onClick={onNavTariffs}
            className="relative z-[5010] text-sm text-gray-400 transition-colors hover:text-aura-neon"
          >
            Тарифы
          </button>
        </nav>

        <div className="app-top-header__actions flex shrink-0 items-center gap-1 sm:gap-2 md:gap-3">
          <button
            type="button"
            onClick={onStartReading}
            className="btn-primary relative z-[5010] inline-flex shrink-0 items-center px-2.5 py-1.5 text-[11px] leading-tight sm:px-4 sm:py-2 sm:text-sm"
          >
            <span className="sm:hidden">Расклад</span>
            <span className="hidden sm:inline">Получить расклад</span>
          </button>
          <button
            type="button"
            onClick={onNavPhoto}
            className="relative z-[5010] flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-[11px] text-gray-300 transition-colors hover:border-aura-gold/30 hover:text-white md:hidden"
            aria-label={photoNavLabel}
          >
            <Camera className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="max-[480px]:hidden">Фото</span>
          </button>
          <button
            type="button"
            onClick={onNavDecks}
            className="relative z-[5010] flex items-center gap-1 rounded-lg border border-aura-gold/25 bg-aura-gold/5 px-2 py-1.5 text-[11px] text-aura-champagne transition-colors hover:border-aura-gold/45 hover:bg-aura-gold/10 md:hidden"
            aria-label="Колоды мастеров"
          >
            <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="max-[480px]:hidden">Колоды</span>
          </button>
          {isLoggedIn ? (
            <RuneBalance compact onBuyClick={onOpenPaywall} />
          ) : null}
          <AuthHeader compact user={authUser} loading={authLoading} />
        </div>
      </div>
    </header>
  );
}
