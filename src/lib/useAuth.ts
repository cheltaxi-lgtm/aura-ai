"use client";

import { useEffect, useState, useCallback } from "react";
import { AUTH_LOGOUT_EVENT } from "@/lib/client-logout";
import { fetchWithTimeout } from "./fetch-with-timeout";

export interface AuthUser {
  sub: string;
  role: "user" | "expert" | "admin";
  email: string;
  name: string;
  slug?: string;
  profileUserId?: string | null;
  oauthGender?: "male" | "female" | null;
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const res = await fetchWithTimeout("/api/auth/me", {
          timeoutMs: 10_000,
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        setUser(data.authenticated ? data.user : null);
        return;
      } catch {
        if (attempt < 2) {
          await new Promise((resolve) => window.setTimeout(resolve, 400 * (attempt + 1)));
          continue;
        }
        setUser(null);
      }
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    const onLogout = () => {
      setUser(null);
      setLoading(false);
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    return () => window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
  }, []);

  return {
    user,
    loading,
    isLoggedIn: user?.role === "user",
    refresh,
  };
}
