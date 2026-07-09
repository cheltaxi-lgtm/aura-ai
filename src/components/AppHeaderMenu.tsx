"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Camera,
  Download,
  Flame,
  Layers,
  LayoutGrid,
  LogIn,
  LogOut,
  Menu,
  Sparkles,
  User,
  Users,
  X,
} from "lucide-react";
import { performClientLogout } from "@/lib/client-logout";
import { navigateToCabinet } from "@/lib/app-shell-nav";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { triggerAppHaptic } from "@/lib/app-haptics";
import type { AuthUser } from "@/lib/useAuth";

const APK_URL =
  process.env.NEXT_PUBLIC_ANDROID_APK_URL?.trim() || "/releases/zovus-latest.apk";

export type AppHeaderMenuProps = {
  photoNavLabel: string;
  isLoggedIn: boolean;
  authUser: AuthUser | null;
  authLoading: boolean;
  onNavMasters: () => void;
  onNavDecks: () => void;
  onNavPhoto: () => void;
  onNavTariffs: () => void;
  onNavRitual: () => void;
  onStartReading: () => void;
};

type MenuItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  download?: boolean;
  accent?: boolean;
  danger?: boolean;
};

export default function AppHeaderMenu({
  photoNavLabel,
  isLoggedIn,
  authUser,
  authLoading,
  onNavMasters,
  onNavDecks,
  onNavPhoto,
  onNavTariffs,
  onNavRitual,
  onStartReading,
}: AppHeaderMenuProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const inAppShell = shouldUseAppShellClient();

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => setOpen(false), []);

  const run = useCallback(
    (action: () => void) => {
      void triggerAppHaptic("light");
      close();
      action();
    },
    [close]
  );

  const openCabinet = useCallback(() => {
    close();
    navigateToCabinet();
  }, [close]);

  const logout = useCallback(async () => {
    close();
    await performClientLogout({ redirectTo: inAppShell ? "/?app=1" : "/" });
  }, [close, inAppShell]);

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
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const navItems: MenuItem[] = [
    {
      id: "photo",
      label: photoNavLabel,
      icon: <Camera className="h-4 w-4" aria-hidden />,
      onClick: () => run(onNavPhoto),
    },
    {
      id: "masters",
      label: "Мастера",
      icon: <Sparkles className="h-4 w-4" aria-hidden />,
      onClick: () => run(onNavMasters),
    },
    {
      id: "decks",
      label: "Колоды",
      icon: <Layers className="h-4 w-4" aria-hidden />,
      onClick: () => run(onNavDecks),
    },
    {
      id: "tariffs",
      label: "Тарифы",
      icon: <LayoutGrid className="h-4 w-4" aria-hidden />,
      onClick: () => run(onNavTariffs),
    },
    {
      id: "joint-reading",
      label: "Совместный расклад",
      icon: <Users className="h-4 w-4" aria-hidden />,
      href: "/joint-reading",
    },
    {
      id: "ritual",
      label: "Заказать обряд",
      icon: <Flame className="h-4 w-4" aria-hidden />,
      onClick: () => run(onNavRitual),
      accent: true,
    },
    {
      id: "reading",
      label: "Получить расклад",
      icon: <Sparkles className="h-4 w-4" aria-hidden />,
      onClick: () => run(onStartReading),
      accent: true,
    },
  ];

  const accountItems: MenuItem[] = [];

  if (authLoading) {
    /* skeleton handled on trigger */
  } else if (authUser?.role === "user") {
    accountItems.push({
      id: "cabinet",
      label: "Личный кабинет",
      icon: <User className="h-4 w-4" aria-hidden />,
      onClick: openCabinet,
    });
  } else if (authUser?.role === "admin") {
    accountItems.push({
      id: "admin",
      label: "Админка",
      icon: <Sparkles className="h-4 w-4" aria-hidden />,
      href: "/admin",
    });
  } else if (authUser?.role === "expert") {
    accountItems.push({
      id: "expert",
      label: "Кабинет эксперта",
      icon: <Sparkles className="h-4 w-4" aria-hidden />,
      href: "/expert",
    });
  } else {
    accountItems.push({
      id: "login",
      label: "Войти",
      icon: <LogIn className="h-4 w-4" aria-hidden />,
      href: inAppShell ? "/auth/user/login?returnTo=/?app=1" : "/auth",
      accent: true,
    });
  }

  if (authUser && !authLoading) {
    accountItems.push({
      id: "logout",
      label: "Выйти",
      icon: <LogOut className="h-4 w-4" aria-hidden />,
      onClick: () => void logout(),
      danger: true,
    });
  }

  if (!inAppShell) {
    navItems.push({
      id: "download",
      label: "Скачать приложение",
      icon: <Download className="h-4 w-4" aria-hidden />,
      href: APK_URL,
      download: true,
    });
  }

  const panel =
    open && mounted
      ? createPortal(
          <div className="app-header-menu-layer" role="presentation">
            <button
              type="button"
              className="app-header-menu-backdrop"
              aria-label="Закрыть меню"
              onClick={close}
            />
            <div
              ref={panelRef}
              className="app-header-menu-panel"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="app-header-menu-panel__head">
                <p id={titleId} className="app-header-menu-panel__title">
                  Меню
                </p>
                <button
                  type="button"
                  className="app-header-menu-panel__close"
                  aria-label="Закрыть"
                  onClick={close}
                >
                  <X className="h-4 w-4" aria-hidden />
                </button>
              </div>

              <div className="app-header-menu-panel__section">
                {navItems.map((item) => (
                  <MenuRow key={item.id} item={item} onNavigate={close} />
                ))}
              </div>

              {accountItems.length > 0 ? (
                <>
                  <p className="app-header-menu-panel__kicker">Аккаунт</p>
                  <div className="app-header-menu-panel__section">
                    {accountItems.map((item) => (
                      <MenuRow key={item.id} item={item} onNavigate={close} />
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

  if (authLoading) {
    return <div className="app-header-menu-trigger app-header-menu-trigger--skeleton" aria-hidden />;
  }

  return (
    <>
      <button
        type="button"
        className={`app-header-menu-trigger${open ? " app-header-menu-trigger--open" : ""}`}
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          void triggerAppHaptic("light");
          setOpen((v) => !v);
        }}
      >
        {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
      </button>
      {panel}
    </>
  );
}

function MenuRow({
  item,
  onNavigate,
}: {
  item: MenuItem;
  onNavigate: () => void;
}) {
  const className = [
    "app-header-menu-item",
    item.accent ? "app-header-menu-item--accent" : "",
    item.danger ? "app-header-menu-item--danger" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const content = (
    <>
      <span className="app-header-menu-item__icon">{item.icon}</span>
      <span className="app-header-menu-item__label">{item.label}</span>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        download={item.download || undefined}
        className={className}
        onClick={() => {
          void triggerAppHaptic("light");
          onNavigate();
        }}
      >
        {content}
      </Link>
    );
  }

  return (
    <button type="button" className={className} onClick={item.onClick}>
      {content}
    </button>
  );
}
