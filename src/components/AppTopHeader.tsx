"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import AppHeaderMenu from "@/components/AppHeaderMenu";
import AppTopHeaderAccount from "@/components/AppTopHeaderAccount";
import AppTopHeaderNav from "@/components/AppTopHeaderNav";
import BrandLogo from "@/components/BrandLogo";
import NotificationBell, {
  NOTIFICATION_COUNT_EVENT,
  OPEN_NOTIFICATIONS_EVENT,
} from "@/components/NotificationBell";
import RuneBalance, { RUNE_BALANCE_EVENT } from "@/components/RuneBalance";
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
  onNavRitual: () => void;
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
  onNavRitual,
  onStartReading,
}: AppTopHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [tariffsOpen, setTariffsOpen] = useState(false);
  const [runeBalance, setRuneBalance] = useState<number | null>(null);
  const [notificationCount, setNotificationCount] = useState(0);

  const openTariffs = () => {
    onNavTariffs?.();
    setTariffsOpen(true);
  };

  const navCallbacks = {
    photoNavLabel,
    onNavPhoto,
    onNavMasters,
    onNavDecks,
    onNavTariffs: openTariffs,
    onNavRitual,
    onStartReading,
  };

  useEffect(() => {
    if (!isLoggedIn) {
      setRuneBalance(null);
      return;
    }
    fetch("/api/runes/balance")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (typeof d?.balance === "number") setRuneBalance(d.balance);
      })
      .catch(() => undefined);
  }, [isLoggedIn]);

  useEffect(() => {
    const onBalance = (e: Event) => {
      const next = (e as CustomEvent<number>).detail;
      if (typeof next === "number") setRuneBalance(next);
    };
    const onNotifications = (e: Event) => {
      const next = (e as CustomEvent<number>).detail;
      if (typeof next === "number") setNotificationCount(next);
    };
    window.addEventListener(RUNE_BALANCE_EVENT, onBalance);
    window.addEventListener(NOTIFICATION_COUNT_EVENT, onNotifications);
    return () => {
      window.removeEventListener(RUNE_BALANCE_EVENT, onBalance);
      window.removeEventListener(NOTIFICATION_COUNT_EVENT, onNotifications);
    };
  }, []);

  const openNotifications = () => {
    window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATIONS_EVENT));
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
      className="app-top-header fixed top-0 left-0 right-0 border-b border-white/5 bg-black/80 backdrop-blur-md max-md:bg-[#080512] max-md:backdrop-blur-none"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:gap-3 sm:px-6 sm:py-3">
        <div className="app-top-header__brand flex min-w-0 shrink-0 items-center gap-1.5 sm:gap-2">
          <BrandLogo
            linkToHome
            showTagline={false}
            markSize={32}
            titleClassName="font-display text-lg font-bold tracking-wider text-white neon-text sm:text-2xl"
          />
        </div>

        {/* Desktop: three premium pills — Меню · CTA · Аккаунт */}
        <div className="app-top-header__actions hidden min-w-0 flex-1 items-center justify-end gap-2 md:flex md:gap-2.5">
          <AppTopHeaderNav {...navCallbacks} />
          <button
            type="button"
            onClick={onStartReading}
            className="app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold"
          >
            Получить расклад
          </button>
          <AppTopHeaderAccount
            user={authUser}
            loading={authLoading}
            runeBalance={runeBalance}
            notificationCount={notificationCount}
            onBuyRunes={onOpenPaywall}
            onOpenNotifications={openNotifications}
          />
          {isLoggedIn && authUser?.role === "user" ? (
            <NotificationBell hiddenTrigger />
          ) : null}
        </div>

        {/* Mobile: runes + menu (notifications inside account section of sheet) */}
        <div className="app-top-header__mobile flex shrink-0 items-center gap-1.5 md:hidden">
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
            onNavRitual={onNavRitual}
            onStartReading={onStartReading}
          />
          {isLoggedIn && authUser?.role === "user" ? (
            <NotificationBell hiddenTrigger />
          ) : null}
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
