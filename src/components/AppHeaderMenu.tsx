"use client";

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  Bell,
  LogIn,
  LogOut,
  Menu,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { performClientLogout } from "@/lib/client-logout";
import { navigateToCabinet } from "@/lib/app-shell-nav";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { triggerAppHaptic } from "@/lib/app-haptics";
import { buildHeaderNavSections } from "@/lib/header-nav-items";
import type { HeaderNavItem } from "@/lib/header-nav-items";
import { OPEN_NOTIFICATIONS_EVENT } from "@/components/NotificationBell";
import type { AuthUser } from "@/lib/useAuth";

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

type AccountItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onClick?: () => void;
  href?: string;
  danger?: boolean;
};

export default function AppHeaderMenu({
  photoNavLabel,
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

  const sections = buildHeaderNavSections({
    photoNavLabel,
    onNavPhoto,
    onNavMasters,
    onNavDecks,
    onNavTariffs,
    onNavRitual,
    onStartReading,
  });

  const accountItems: AccountItem[] = [];

  if (authLoading) {
    /* skeleton handled on trigger */
  } else if (authUser?.role === "user") {
    accountItems.push({
      id: "cabinet",
      label: "Личный кабинет",
      icon: <User className="h-4 w-4" aria-hidden />,
      onClick: openCabinet,
    });
    accountItems.push({
      id: "notifications",
      label: "Уведомления",
      icon: <Bell className="h-4 w-4" aria-hidden />,
      onClick: () => {
        close();
        window.dispatchEvent(new CustomEvent(OPEN_NOTIFICATIONS_EVENT));
      },
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

              {sections.map((section) => (
                <div key={section.id}>
                  <p className="app-header-menu-panel__kicker">{section.title}</p>
                  <div className="app-header-menu-panel__section">
                    {section.items.map((item) => (
                      <NavRow key={item.id} item={item} onNavigate={close} onAction={run} />
                    ))}
                  </div>
                </div>
              ))}

              {accountItems.length > 0 ? (
                <>
                  <p className="app-header-menu-panel__kicker">Аккаунт</p>
                  <div className="app-header-menu-panel__section">
                    {accountItems.map((item) => (
                      <AccountRow key={item.id} item={item} onNavigate={close} />
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
        className={`app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold app-header-menu-trigger${
          open ? " app-header-menu-trigger--open" : ""
        }`}
        aria-label={open ? "Закрыть меню" : "Открыть меню"}
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => {
          void triggerAppHaptic("light");
          setOpen((v) => !v);
        }}
      >
        {open ? <X className="h-3.5 w-3.5" aria-hidden /> : <Menu className="h-3.5 w-3.5" aria-hidden />}
        Меню
      </button>
      {panel}
    </>
  );
}

function NavRow({
  item,
  onNavigate,
  onAction,
}: {
  item: HeaderNavItem;
  onNavigate: () => void;
  onAction: (fn: () => void) => void;
}) {
  const Icon = item.icon;
  const content = (
    <>
      <span className="app-header-menu-item__icon">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="app-header-menu-item__label">{item.label}</span>
    </>
  );

  if (item.href) {
    return (
      <Link
        href={item.href}
        download={item.download || undefined}
        className="app-header-menu-item"
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
    <button
      type="button"
      className="app-header-menu-item"
      onClick={() => item.onClick && onAction(item.onClick)}
    >
      {content}
    </button>
  );
}

function AccountRow({
  item,
  onNavigate,
}: {
  item: AccountItem;
  onNavigate: () => void;
}) {
  const className = [
    "app-header-menu-item",
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
