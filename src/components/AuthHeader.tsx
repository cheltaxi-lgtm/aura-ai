"use client";

import Link from "next/link";
import { LogIn, LogOut, User, Sparkles } from "lucide-react";
import { performClientLogout } from "@/lib/client-logout";
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
    window.location.assign("/cabinet");
  };

  const btnClass = compact
    ? "btn-neon relative z-10 inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
    : "btn-neon relative z-10 flex items-center gap-2 text-sm";

  if (loading) {
    return <div className="h-8 w-8 shrink-0 animate-pulse rounded-xl bg-white/5 sm:w-24" />;
  }

  if (user?.role === "user") {
    return (
      <div className="relative z-10 flex shrink-0 items-center gap-1 sm:gap-2">
        <button type="button" onClick={openCabinet} className={btnClass} title="Личный кабинет">
          <User className="h-4 w-4 shrink-0" aria-hidden />
          <span className={compact ? "hidden sm:inline" : undefined}>
            {user.name.split(" ")[0]}
          </span>
        </button>
        <button
          type="button"
          onClick={logout}
          className="relative z-10 shrink-0 p-1 text-gray-500 hover:text-white"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-4 w-4" />
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
          className="relative z-10 shrink-0 p-1 text-gray-500 hover:text-white"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-4 w-4" />
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
          className="relative z-10 shrink-0 p-1 text-gray-500 hover:text-white"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-4 w-4" />
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
