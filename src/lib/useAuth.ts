"use client";

import { useEffect, useState, useCallback } from "react";
import { AUTH_LOGOUT_EVENT } from "@/lib/client-logout";
import {
  clearAuthPending,
  hasAuthPendingQuery,
  isAuthPending,
  stripAuthPendingQuery,
} from "@/lib/auth-pending";
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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const pending = isAuthPending() || hasAuthPendingQuery();
    const attempts = pending ? 12 : 3;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const res = await fetchWithTimeout("/api/auth/me", {
          timeoutMs: 10_000,
          credentials: "include",
          cache: "no-store",
        });
        const data = await res.json();
        if (data.authenticated && data.user) {
          setUser(data.user);
          clearAuthPending();
          stripAuthPendingQuery();
          return;
        }
        // Cookie lag after login in Android WebView: keep polling while pending.
        if (pending && attempt < attempts - 1) {
          await sleep(350 * Math.min(attempt + 1, 4));
          continue;
        }
        setUser(null);
        if (pending) {
          clearAuthPending();
          stripAuthPendingQuery();
        }
        return;
      } catch {
        if (attempt < attempts - 1) {
          await sleep(400 * (attempt + 1));
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
      clearAuthPending();
    };
    const onLogin = () => {
      setLoading(true);
      void refresh().finally(() => setLoading(false));
    };
    window.addEventListener(AUTH_LOGOUT_EVENT, onLogout);
    window.addEventListener("aura:login", onLogin);
    return () => {
      window.removeEventListener(AUTH_LOGOUT_EVENT, onLogout);
      window.removeEventListener("aura:login", onLogin);
    };
  }, [refresh]);

  return {
    user,
    loading,
    isLoggedIn: user?.role === "user",
    refresh,
  };
}
