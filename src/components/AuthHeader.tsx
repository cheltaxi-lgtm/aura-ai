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

export default function AuthHeader() {
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

  if (loading) {
    return <div className="h-10 w-24 animate-pulse rounded-xl bg-white/5" />;
  }

  if (auth?.role === "user") {
    return (
      <div className="flex items-center gap-3">
        <Link href="/cabinet" className="btn-neon flex items-center gap-2 text-sm">
          <User className="h-4 w-4" />
          {auth.name.split(" ")[0]}
        </Link>
        <button onClick={logout} className="text-gray-500 hover:text-white" title="Выйти">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (auth?.role === "admin") {
    return (
      <div className="flex items-center gap-3">
        <Link href="/admin" className="btn-neon flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4" />
          Админка
        </Link>
        <button onClick={logout} className="text-gray-500 hover:text-white" title="Выйти">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  if (auth?.role === "expert") {
    return (
      <div className="flex items-center gap-3">
        <Link href="/expert" className="btn-neon flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4" />
          Кабинет
        </Link>
        <button onClick={logout} className="text-gray-500 hover:text-white" title="Выйти">
          <LogOut className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <Link href="/auth" className="btn-neon flex items-center gap-2 text-sm">
      <LogIn className="h-4 w-4" />
      Войти
    </Link>
  );
}
