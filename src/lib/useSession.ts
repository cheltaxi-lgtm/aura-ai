"use client";

import { useCallback, useEffect, useState } from "react";
import { generateId } from "./id";
import { fetchWithTimeout } from "./fetch-with-timeout";
import { confirmAgeGateOnServer, isAgeGateConfirmed, AGE_GATE_EVENT } from "./age-gate";
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
  storageBlocked?: boolean;
  referrerSlug?: string | null;
  /** Session belongs to another logged-in profile — client should reconnect */
  ownerMismatch?: boolean;
  /** Guest must confirm 18+ before server session is created */
  ageRequired?: boolean;
  isUnlimited?: boolean;
}

function ageRequiredSession(): SessionState {
  return {
    sessionId: "",
    ageRequired: true,
    freeQuestionsUsed: 0,
    freeLimit: 2,
    hasAccess: false,
    canChat: false,
    questionsRemaining: 0,
  };
}

function offlineSession(): SessionState {
  const offlineId = generateId();
  try {
    localStorage.setItem(SESSION_KEY, offlineId);
  } catch {
    /* private mode */
  }
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
    const postSession = async () =>
      fetchWithTimeout("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          referrerSlug: refToken,
          influencerToken: params.get("ref") ?? undefined,
        }),
        timeoutMs: 10_000,
      });

    try {
      let res = await postSession();
      if (res.status === 403) {
        const body = (await res.json().catch(() => null)) as { code?: string } | null;
        if (body?.code === "age_required") {
          if (isAgeGateConfirmed()) {
            await confirmAgeGateOnServer();
            res = await postSession();
          } else {
            const pending = ageRequiredSession();
            setSession(pending);
            return pending;
          }
        }
      }
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
      let storageBlocked = false;
      try {
        const probe = "__aura_ls__";
        localStorage.setItem(probe, "1");
        localStorage.removeItem(probe);
      } catch {
        storageBlocked = true;
      }

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
        if (isAgeGateConfirmed()) {
          await confirmAgeGateOnServer();
        }
        active = await createSession(refToken);
      } else if (active.ownerMismatch) {
        localStorage.removeItem(SESSION_KEY);
        active = await createSession(refToken);
      }

      if (active) {
        if (storageBlocked) {
          active = { ...active, storageBlocked: true, offline: true, canChat: false };
        }
        setSession(active);
      }

      if (paid && demo && active?.sessionId && !active.offline) {
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

  useEffect(() => {
    const onAgeConfirmed = () => {
      const params = new URLSearchParams(window.location.search);
      const refToken = params.get("ref") ?? referrerSlug;
      void reconnectSession(refToken);
    };
    window.addEventListener(AGE_GATE_EVENT, onAgeConfirmed);
    return () => window.removeEventListener(AGE_GATE_EVENT, onAgeConfirmed);
  }, [referrerSlug, reconnectSession]);

  /** New billing session without clearing the current one from state first (no flicker). */
  const spawnSession = createSession;

  return { session, loading, refresh, reconnectSession, spawnSession };
}
