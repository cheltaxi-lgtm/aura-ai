"use client";

import Link from "next/link";
import { LogIn, LogOut, User, Sparkles } from "lucide-react";
import { performClientLogout } from "@/lib/client-logout";
import NotificationBell from "@/components/NotificationBell";
import { navigateToCabinet } from "@/lib/app-shell-nav";
import { normalizePersonDisplayNameOr } from "@/lib/normalize-person-name";
import type { AuthUser } from "@/lib/useAuth";

export const NAVIGATE_CABINET_EVENT = "aura:navigate-cabinet";

interface AuthHeaderProps {
  compact?: boolean;
  /** When passed from useAuth — avoids duplicate /api/auth/me and UI desync. */
  user?: AuthUser | null;
  loading?: boolean;
}

export default function AuthHeader({
  compact = false,
  user = null,
  loading = false,
}: AuthHeaderProps) {
  const logout = async () => {
    await performClientLogout({ redirectTo: "/" });
  };

  const openCabinet = () => {
    window.dispatchEvent(new CustomEvent(NAVIGATE_CABINET_EVENT));
    navigateToCabinet();
  };

  const btnClass = compact
    ? "btn-neon relative z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
    : "app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold";

  if (loading) {
    return <div className="h-8 w-8 shrink-0 animate-pulse rounded-xl bg-white/5 sm:w-24" />;
  }

  if (user?.role === "user") {
    return (
      <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-2">
        <NotificationBell variant="headerPill" />
        <button type="button" onClick={openCabinet} className={btnClass} title="Личный кабинет">
          <User className="h-4 w-4 shrink-0" aria-hidden />
          <span className={compact ? "hidden sm:inline" : undefined}>
            {normalizePersonDisplayNameOr(user.name, user.name.split(" ")[0])}
          </span>
        </button>
        <button
          type="button"
          onClick={logout}
          className="app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold px-2.5"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  if (user?.role === "admin") {
    return (
      <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-2">
        <Link href="/admin" className={btnClass} title="Админка">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span className={compact ? "hidden sm:inline" : undefined}>Админка</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          className="app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold px-2.5"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  if (user?.role === "expert") {
    return (
      <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-2">
        <Link href="/expert" className={btnClass} title="Кабинет эксперта">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span className={compact ? "hidden sm:inline" : undefined}>Кабинет</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          className="app-top-header__pill relative z-[5010] btn-luxe btn-luxe--sm btn-luxe--pill btn-luxe--gold px-2.5"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden />
        </button>
      </div>
    );
  }

  return (
    <Link href="/auth" className={btnClass} title="Войти">
      <LogIn className="h-4 w-4 shrink-0" aria-hidden />
      <span className={compact ? "hidden sm:inline" : undefined}>Войти</span>
    </Link>
  );
}
