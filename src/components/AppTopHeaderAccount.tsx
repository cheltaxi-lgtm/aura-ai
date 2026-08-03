"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Bell, ChevronDown, LogIn, LogOut, Sparkles, User } from "lucide-react";
import { performClientLogout } from "@/lib/client-logout";
import { NAVIGATE_CABINET_EVENT } from "@/components/AuthHeader";
import { navigateToCabinet } from "@/lib/app-shell-nav";
import type { AuthUser } from "@/lib/useAuth";

type Anchor = { top: number; right: number; minWidth: number };

export type AppTopHeaderAccountProps = {
  user: AuthUser | null;
  loading: boolean;
  runeBalance: number | null;
  notificationCount: number;
  onBuyRunes: () => void;
  onOpenNotifications: () => void;
};

export default function AppTopHeaderAccount({
  user,
  loading,
  runeBalance,
  notificationCount,
  onBuyRunes,
  onOpenNotifications,
}: AppTopHeaderAccountProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent | TouchEvent) => {
      const target = e.target as Node;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, close]);

  const syncAnchor = useCallback(() => {
    const btn = triggerRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setAnchor({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
      minWidth: Math.max(rect.width, 14 * 16),
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    syncAnchor();
    window.addEventListener("resize", syncAnchor);
    window.addEventListener("scroll", syncAnchor, true);
    return () => {
      window.removeEventListener("resize", syncAnchor);
      window.removeEventListener("scroll", syncAnchor, true);
    };
  }, [open, syncAnchor]);

  const logout = async () => {
    close();
    await performClientLogout({ redirectTo: "/" });
  };

  const openCabinet = () => {
    close();
    window.dispatchEvent(new CustomEvent(NAVIGATE_CABINET_EVENT));
    navigateToCabinet();
  };

  if (loading) {
    return <div className="app-top-header__pill h-8 w-24 animate-pulse rounded-full bg-white/5" />;
  }

  const pillClass =
    "app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold";

  if (!user) {
    return (
      <Link href="/auth" className={pillClass} title="Войти">
        <LogIn className="h-3.5 w-3.5 shrink-0" aria-hidden />
        Войти
      </Link>
    );
  }

  const label =
    user.role === "admin"
      ? "Админка"
      : user.role === "expert"
        ? "Кабинет"
        : (user.name?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "Профиль");

  const panel =
    open && anchor && mounted
      ? createPortal(
          <div
            ref={panelRef}
            id={titleId}
            className="app-top-header-nav-panel app-top-header-account-panel"
            role="menu"
            aria-label="Аккаунт"
            style={{
              top: anchor.top,
              right: anchor.right,
              left: "auto",
              minWidth: anchor.minWidth,
            }}
          >
            {user.role === "user" && runeBalance !== null ? (
              <div className="app-top-header-nav-panel__section">
                <button
                  type="button"
                  className="app-top-header-nav-panel__item"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onBuyRunes();
                  }}
                >
                  <span className="app-top-header-nav-panel__icon">ᚢ</span>
                  <span>
                    Баланс: <strong>{runeBalance}</strong> — пополнить
                  </span>
                </button>
                <button
                  type="button"
                  className="app-top-header-nav-panel__item"
                  role="menuitem"
                  onClick={() => {
                    close();
                    onOpenNotifications();
                  }}
                >
                  <span className="app-top-header-nav-panel__icon">
                    <Bell className="h-4 w-4" aria-hidden />
                  </span>
                  <span>
                    Уведомления
                    {notificationCount > 0 ? ` (${notificationCount})` : ""}
                  </span>
                </button>
                <button
                  type="button"
                  className="app-top-header-nav-panel__item"
                  role="menuitem"
                  onClick={openCabinet}
                >
                  <span className="app-top-header-nav-panel__icon">
                    <User className="h-4 w-4" aria-hidden />
                  </span>
                  <span>Личный кабинет</span>
                </button>
              </div>
            ) : null}

            {user.role === "admin" ? (
              <div className="app-top-header-nav-panel__section">
                <Link href="/admin" className="app-top-header-nav-panel__item" role="menuitem" onClick={close}>
                  <span className="app-top-header-nav-panel__icon">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span>Админка</span>
                </Link>
              </div>
            ) : null}

            {user.role === "expert" ? (
              <div className="app-top-header-nav-panel__section">
                <Link href="/expert" className="app-top-header-nav-panel__item" role="menuitem" onClick={close}>
                  <span className="app-top-header-nav-panel__icon">
                    <Sparkles className="h-4 w-4" aria-hidden />
                  </span>
                  <span>Кабинет эксперта</span>
                </Link>
              </div>
            ) : null}

            <div className="app-top-header-nav-panel__section">
              <button
                type="button"
                className="app-top-header-nav-panel__item app-top-header-nav-panel__item--danger"
                role="menuitem"
                onClick={() => void logout()}
              >
                <span className="app-top-header-nav-panel__icon">
                  <LogOut className="h-4 w-4" aria-hidden />
                </span>
                <span>Выйти</span>
              </button>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${pillClass}${open ? " app-top-header-nav-trigger--open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? titleId : undefined}
        title={label}
      >
        <User className="h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="max-w-[5.5rem] truncate">{label}</span>
        {notificationCount > 0 ? (
          <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#1a0f06] px-1 text-[10px] font-bold leading-none text-amber-200">
            {notificationCount > 9 ? "9+" : notificationCount}
          </span>
        ) : null}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform duration-200 ${
            open ? "rotate-180" : ""
          }`}
          aria-hidden
        />
      </button>
      {panel}
    </>
  );
}
