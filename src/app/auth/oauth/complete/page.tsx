"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { finishUserAuthSuccess } from "@/lib/client-user-auth-success";
import { sanitizeReturnTo } from "@/lib/safe-redirect";

export default function OAuthCompletePage() {
  const [error, setError] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const returnTo = sanitizeReturnTo(params.get("returnTo"), "/");
    const mode = params.get("mode") === "login" ? "login" : "register";
    const isNewUser = params.get("new") === "1";
    const needsProfile = params.get("needsProfile") === "1";

    void (async () => {
      try {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const me = meRes.ok ? await meRes.json() : null;
        if (!me?.authenticated) {
          setError("Сессия не создана. Попробуйте войти снова.");
          return;
        }

        let profile: Record<string, unknown> | null = null;
        if (params.get("hasProfile") === "1" && me.user?.profileUserId) {
          const profileRes = await fetch("/api/cabinet", { credentials: "include" });
          if (profileRes.ok) {
            const cabinet = await profileRes.json();
            profile = cabinet?.profile ?? null;
          }
        }

        const destination = await finishUserAuthSuccess({
          mode,
          returnTo,
          isNewUser,
          needsProfile,
          userName: me.user?.name,
          profile,
        });
        window.location.assign(destination);
      } catch {
        setError("Не удалось завершить вход. Попробуйте снова.");
      }
    })();
  }, []);

  if (error) {
    return (
      <div className="auth-page flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 text-sm text-red-400">{error}</p>
        <Link href="/auth/user/login" className="text-sm text-aura-champagne underline">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-page flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm text-aura-ivory/60">Завершаем вход…</p>
    </div>
  );
}
