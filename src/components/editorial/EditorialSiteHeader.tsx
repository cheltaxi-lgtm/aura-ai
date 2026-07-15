"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import AppTopHeaderAccount from "@/components/AppTopHeaderAccount";
import AppTopHeaderNav from "@/components/AppTopHeaderNav";
import BrandLogo from "@/components/BrandLogo";
import RuneBalance from "@/components/RuneBalance";
import { buildHeaderNavSections } from "@/lib/header-nav-items";
import { BRAND_LOGO_HEADER } from "@/lib/brand";
import type { AuthUser } from "@/lib/useAuth";

export type EditorialSiteHeaderProps = {
  isLoggedIn: boolean;
  authUser: AuthUser | null;
  authLoading: boolean;
  runeBalance: number | null;
  notificationCount: number;
  onOpenPaywall: () => void;
  onOpenNotifications: () => void;
  onNavMasters: () => void;
  onStartReading: () => void;
  photoNavLabel: string;
  onNavDecks: () => void;
  onNavPhoto: () => void;
  onNavTariffs: () => void;
  onNavRitual: () => void;
};

export default function EditorialSiteHeader({
  isLoggedIn,
  authUser,
  authLoading,
  runeBalance,
  notificationCount,
  onOpenPaywall,
  onOpenNotifications,
  onNavMasters,
  onStartReading,
  photoNavLabel,
  onNavDecks,
  onNavPhoto,
  onNavTariffs,
  onNavRitual,
}: EditorialSiteHeaderProps) {
  const headerRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const navCallbacks = {
    photoNavLabel,
    onNavPhoto,
    onNavMasters,
    onNavDecks,
    onNavTariffs,
    onNavRitual,
    onStartReading,
  };

  const menuSections = buildHeaderNavSections(navCallbacks, { isLoggedIn });

  useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const sync = () => {
      const height = Math.ceil(el.getBoundingClientRect().height);
      document.documentElement.style.setProperty("--app-header-h", `${height}px`);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 48);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!isLoggedIn) setMenuOpen(false);
  }, [isLoggedIn]);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  const runMenuAction = useCallback(
    (action: () => void) => {
      closeMenu();
      action();
    },
    [closeMenu]
  );

  return (
    <>
      <header
        ref={headerRef}
        className={`editorial-header ${scrolled ? "editorial-header--scrolled" : ""}`}
      >
        <div className="editorial-header__row">
          <div className="editorial-header__brand">
            <BrandLogo {...BRAND_LOGO_HEADER} />
          </div>

          <div className="editorial-header__actions">
            {isLoggedIn ? <RuneBalance compact onBuyClick={onOpenPaywall} /> : null}
            {!isLoggedIn ? (
              <button
                type="button"
                className="editorial-btn editorial-btn--gold editorial-btn--sm hidden min-[768px]:inline-flex"
                onClick={onStartReading}
              >
                Открыть 3 карты
              </button>
            ) : null}
            {isLoggedIn ? (
              <div className="editorial-header__menu-dropdown hidden min-[900px]:block">
                <AppTopHeaderNav {...navCallbacks} isLoggedIn={isLoggedIn} />
              </div>
            ) : null}
            {!isLoggedIn ? (
              <Link href="/auth" className="editorial-btn editorial-btn--ghost editorial-btn--sm hidden min-[640px]:inline-flex">
                Войти
              </Link>
            ) : null}
            {isLoggedIn ? (
              <AppTopHeaderAccount
                user={authUser}
                loading={authLoading}
                runeBalance={runeBalance}
                notificationCount={notificationCount}
                onBuyRunes={onOpenPaywall}
                onOpenNotifications={onOpenNotifications}
              />
            ) : null}
            {isLoggedIn ? (
              <button
                type="button"
                className="editorial-header__menu-btn"
                aria-label={menuOpen ? "Закрыть меню" : "Открыть меню"}
                onClick={() => setMenuOpen((v) => !v)}
              >
                {menuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      {isLoggedIn && menuOpen ? (
        <div className="editorial-header__sheet min-[900px]:hidden" role="dialog" aria-modal="true">
          {menuSections.map((section) => (
            <div key={section.id} className="editorial-header__sheet-group">
              <p className="editorial-header__sheet-kicker">{section.title}</p>
              {section.items.map((item) =>
                item.href ? (
                  <Link
                    key={item.id}
                    href={item.href}
                    download={item.download || undefined}
                    className="editorial-header__sheet-link"
                    onClick={closeMenu}
                  >
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.id}
                    type="button"
                    className="editorial-header__sheet-link"
                    onClick={() => item.onClick && runMenuAction(item.onClick)}
                  >
                    {item.label}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
