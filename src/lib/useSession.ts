"use client";

import { useCallback, useEffect, useState } from "react";
import { generateId } from "./id";
import { fetchWithTimeout } from "./fetch-with-timeout";
const SESSION_KEY = "aura_session_id";

export interface SessionState {
  sessionId: string;
  freeQuestionsUsed: number;
  freeLimit: number;
  /** Paid unlock (single or subscription) */
  hasAccess: boolean;
  canChat?: boolean;
  questionsRemaining?: number | null;
  offline?: boolean;
  referrerSlug?: string | null;
}

function offlineSession(): SessionState {
  const offlineId = generateId();
  localStorage.setItem(SESSION_KEY, offlineId);
  return {
    sessionId: offlineId,
    offline: true,
    freeQuestionsUsed: 0,
    freeLimit: 2,
    hasAccess: false,
    canChat: false,
    questionsRemaining: 0,
  };
}

export function useAuraSession(referrerSlug?: string) {
  const [session, setSession] = useState<SessionState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (id: string): Promise<SessionState | null> => {
    try {
      const res = await fetchWithTimeout(`/api/session?id=${encodeURIComponent(id)}`, {
        timeoutMs: 10_000,
      });
      if (!res.ok) return null;
      const data = (await res.json()) as SessionState;
      if (!data.sessionId) return null;
      setSession(data);
      return data;
    } catch {
      return null;
    }
  }, []);

  const createSession = useCallback(async (refToken?: string | null): Promise<SessionState> => {
    const params = new URLSearchParams(window.location.search);
    try {
      const res = await fetchWithTimeout("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerSlug: refToken,
          influencerToken: params.get("ref") ?? undefined,
        }),
        timeoutMs: 10_000,
      });
      if (!res.ok) {
        const fallback = offlineSession();
        setSession(fallback);
        return fallback;
      }
      const data = (await res.json()) as SessionState;
      if (!data.sessionId) {
        const fallback = offlineSession();
        setSession(fallback);
        return fallback;
      }
      localStorage.setItem(SESSION_KEY, data.sessionId);
      setSession(data);
      return data;
    } catch {
      const fallback = offlineSession();
      setSession(fallback);
      return fallback;
    }
  }, []);

  useEffect(() => {
    async function init() {
      const params = new URLSearchParams(window.location.search);
      const refToken = params.get("ref") ?? referrerSlug;
      const existing = localStorage.getItem(SESSION_KEY);
      const paid = params.get("paid");
      const demo = params.get("demo") as "single" | "subscription" | null;

      let active: SessionState | null = null;

      if (existing) {
        active = await refresh(existing);
        if (!active) {
          localStorage.removeItem(SESSION_KEY);
        }
      }

      if (!active) {
        active = await createSession(refToken);
      }

      if (paid && demo && active.sessionId && !active.offline) {
        await fetch("/api/payments/demo-unlock", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: active.sessionId, plan: demo }),
        });
        await refresh(active.sessionId);
      }

      setLoading(false);
    }
    init();
  }, [referrerSlug, refresh, createSession]);

  const reconnectSession = useCallback(async (refToken?: string | null): Promise<SessionState> => {
    localStorage.removeItem(SESSION_KEY);
    setSession(null);
    return createSession(refToken);
  }, [createSession]);

  return { session, loading, refresh, reconnectSession };
}
