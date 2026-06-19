"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, User, Sparkles } from "lucide-react";

interface AuthUser {
  sub: string;
  role: "user" | "expert" | "admin";
  email: string;
  name: string;
  slug?: string;
}

interface AuthHeaderProps {
  compact?: boolean;
}

export default function AuthHeader({ compact = false }: AuthHeaderProps) {
  const router = useRouter();
  const [auth, setAuth] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setAuth(d.authenticated ? d.user : null))
      .finally(() => setLoading(false));
  }, []);

  const logout = async () => {
    await fetch("/api/auth/me", { method: "DELETE" });
    setAuth(null);
    router.refresh();
  };

  const btnClass = compact
    ? "btn-neon inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs sm:gap-2 sm:px-4 sm:py-2 sm:text-sm"
    : "btn-neon flex items-center gap-2 text-sm";

  if (loading) {
    return <div className="h-8 w-8 shrink-0 animate-pulse rounded-xl bg-white/5 sm:w-24" />;
  }

  if (auth?.role === "user") {
    return (
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Link href="/cabinet" className={btnClass} title="Личный кабинет">
          <User className="h-4 w-4 shrink-0" aria-hidden />
          <span className={compact ? "hidden sm:inline" : undefined}>{auth.name.split(" ")[0]}</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          className="shrink-0 p-1 text-gray-500 hover:text-white"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (auth?.role === "admin") {
    return (
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Link href="/admin" className={btnClass} title="Админка">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span className={compact ? "hidden sm:inline" : undefined}>Админка</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          className="shrink-0 p-1 text-gray-500 hover:text-white"
          title="Выйти"
          aria-label="Выйти"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (auth?.role === "expert") {
    return (
      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <Link href="/expert" className={btnClass} title="Кабинет эксперта">
          <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
          <span className={compact ? "hidden sm:inline" : undefined}>Кабинет</span>
        </Link>
        <button
          type="button"
          onClick={logout}
          className="shrink-0 p-1 text-gray-500 hover:text-white"
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
