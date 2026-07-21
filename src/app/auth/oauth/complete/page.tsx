"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { finishUserAuthSuccess } from "@/lib/client-user-auth-success";
import { fetchAuthMeWithRetry, type AuthMeResponse } from "@/lib/client-auth-session";
import { markAuthPending, withAppShellAuthParams } from "@/lib/auth-pending";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";
import { flushWebViewCookies } from "@/lib/webview-cookies";
import { navigateViaSessionBridge, shouldUseSessionBridge } from "@/lib/session-bridge";
import { readUtmAttribution } from "@/lib/utm/attribution";
import { onboardingRedirectUrl } from "@/lib/post-auth-return";

type RegistrationPreview = {
  providerLabel: string;
  name: string;
  gender: "male" | "female" | null;
};

/** Hard ceiling — never leave the user on "Завершаем вход…" forever. */
const OAUTH_COMPLETE_WATCHDOG_MS = 8_000;

async function ensureAuthenticated(handoff: string | null): Promise<AuthMeResponse | null> {
  // Cookie from OAuth callback document redirect is usually already visible.
  let me = await fetchAuthMeWithRetry({ attempts: 3, delayMs: 200, timeoutMs: 6_000 });
  if (me?.authenticated) return me;
  if (!handoff) {
    // One more short burst — cookie lag on some browsers.
    return fetchAuthMeWithRetry({ attempts: 4, delayMs: 250, timeoutMs: 6_000 });
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const handoffRes = await fetchWithTimeout("/api/auth/oauth/handoff", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        timeoutMs: 8_000,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: handoff }),
      });
      if (handoffRes.ok) {
        await flushWebViewCookies();
        return fetchAuthMeWithRetry({ attempts: 5, delayMs: 250, timeoutMs: 6_000 });
      }
      if (handoffRes.status === 400 || handoffRes.status === 404) {
        break;
      }
    } catch {
      /* retry handoff POST on network errors */
    }
    await new Promise((resolve) => window.setTimeout(resolve, 250 * (attempt + 1)));
  }

  return fetchAuthMeWithRetry({ attempts: 4, delayMs: 300, timeoutMs: 6_000 });
}

function hardNavigate(destination: string): void {
  const landing = withAppShellAuthParams(destination);
  // Prefer assign+replace race: if one is blocked, the other still fires.
  try {
    window.location.replace(landing);
  } catch {
    window.location.href = landing;
  }
  // Absolute fallback if browser swallows replace (extensions / bfcache).
  window.setTimeout(() => {
    if (window.location.pathname.startsWith("/auth/oauth/complete")) {
      window.location.href = landing;
    }
  }, 400);
}

export default function OAuthCompletePage() {
  const started = useRef(false);
  const navigated = useRef(false);
  const [error, setError] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [preview, setPreview] = useState<RegistrationPreview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (started.current || typeof window === "undefined") return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const registration = params.get("registration")?.trim();
    if (registration) {
      setRegistrationCode(registration);
      void fetch(`/api/auth/oauth/register?code=${encodeURIComponent(registration)}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Ссылка регистрации устарела.");
          setPreview((await response.json()) as RegistrationPreview);
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Ссылка устарела."));
      return;
    }

    // Capture query BEFORE any async work / history mutation.
    const returnTo = sanitizeReturnTo(params.get("returnTo"), "/");
    const mode = params.get("mode") === "register" ? "register" : "login";
    const isNewUser = params.get("new") === "1";
    const needsProfile = params.get("needsProfile") === "1";
    const hasProfileFlag = params.get("hasProfile") === "1";
    const handoffFromQuery = params.get("handoff");
    const handoffFromHash = (() => {
      const raw = window.location.hash.startsWith("#")
        ? window.location.hash.slice(1)
        : window.location.hash;
      return new URLSearchParams(raw).get("handoff");
    })();
    let handoffFromStore: string | null = null;
    try {
      handoffFromStore = window.sessionStorage.getItem("aura_oauth_handoff");
      if (handoffFromStore) window.sessionStorage.removeItem("aura_oauth_handoff");
    } catch {
      handoffFromStore = null;
    }
    const handoff = handoffFromQuery || handoffFromHash || handoffFromStore;
    const alreadyBridged = params.get("_bridged") === "1";

    const watchdogFallback = () => {
      if (navigated.current) return;
      navigated.current = true;
      markAuthPending();
      const fallback =
        needsProfile || isNewUser ? onboardingRedirectUrl() : returnTo;
      hardNavigate(fallback);
    };
    const watchdog = window.setTimeout(watchdogFallback, OAUTH_COMPLETE_WATCHDOG_MS);

    const go = (destination: string) => {
      if (navigated.current) return;
      navigated.current = true;
      window.clearTimeout(watchdog);
      hardNavigate(destination);
    };

    void (async () => {
      try {
        // Native WebView only: stamp aura_auth on a document response first.
        if (handoff && shouldUseSessionBridge() && !alreadyBridged) {
          const resume = new URL(window.location.href);
          resume.searchParams.delete("handoff");
          resume.hash = "";
          resume.searchParams.set("app", "1");
          resume.searchParams.set("_bridged", "1");
          const bridged = await navigateViaSessionBridge(
            `${resume.pathname}${resume.search}`,
            handoff
          );
          if (bridged) {
            window.clearTimeout(watchdog);
            navigated.current = true;
            return;
          }
        }

        const me = await ensureAuthenticated(alreadyBridged ? null : handoff);
        await flushWebViewCookies();
        markAuthPending();

        if (!me?.authenticated) {
          if (handoff && !alreadyBridged) {
            go(returnTo);
            return;
          }
          window.clearTimeout(watchdog);
          setError("Сессия не создана. Попробуйте войти снова.");
          return;
        }

        let profile: Record<string, unknown> | null = null;
        if (hasProfileFlag && me.user?.profileUserId) {
          try {
            const profileRes = await fetchWithTimeout("/api/cabinet", {
              credentials: "include",
              cache: "no-store",
              timeoutMs: 4_000,
            });
            if (profileRes.ok) {
              profile = ((await profileRes.json()) as { profile?: Record<string, unknown> })
                ?.profile ?? null;
            }
          } catch {
            /* profile optional — do not block login */
          }
        }

        const oauthGender =
          me.user?.oauthGender === "male" || me.user?.oauthGender === "female"
            ? me.user.oauthGender
            : undefined;
        const liveNeedsProfile = Boolean(
          needsProfile || me.needsProfile || !me.user?.profileUserId
        );
        const liveIsNewUser = Boolean(isNewUser || (liveNeedsProfile && mode === "register"));

        const destination = await finishUserAuthSuccess({
          mode,
          returnTo,
          isNewUser: liveIsNewUser,
          needsProfile: liveNeedsProfile,
          userName: me.user?.name,
          profile,
          oauthGender,
          // Skip second /me round-trip — we already have live session.
          skipAuthRecheck: true,
        });

        if (shouldUseSessionBridge()) {
          const bridged = await navigateViaSessionBridge(destination);
          if (bridged) {
            window.clearTimeout(watchdog);
            navigated.current = true;
            return;
          }
        }
        go(destination);
      } catch {
        window.clearTimeout(watchdog);
        if (!navigated.current) {
          // Last resort: cookie is often already set — leave complete page.
          watchdogFallback();
        }
      }
    })();

    return () => {
      window.clearTimeout(watchdog);
    };
  }, []);

  const completeRegistration = async () => {
    if (!accepted || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/oauth/register", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: registrationCode,
          acceptedTerms: true,
          ageConfirmed: true,
          marketingConsent: marketing,
          attribution: readUtmAttribution() ?? undefined,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("Не удалось завершить регистрацию.");

      if (data.handoff && !isNativeCapacitorPlatform()) {
        const params = new URLSearchParams({
          handoff: data.handoff,
          returnTo: sanitizeReturnTo(data.returnTo, "/"),
          mode: "register",
          new: data.isNewUser ? "1" : "0",
          needsProfile: data.needsProfile ? "1" : "0",
        });
        window.location.replace(`zovus://open/auth/oauth/complete?${params.toString()}`);
        return;
      }

      const destination = await finishUserAuthSuccess({
        mode: "register",
        returnTo: sanitizeReturnTo(data.returnTo, "/"),
        isNewUser: Boolean(data.isNewUser),
        needsProfile: Boolean(data.needsProfile),
        userName: data.name,
        oauthGender:
          data.gender === "male" || data.gender === "female" ? data.gender : undefined,
        skipAuthRecheck: true,
      });
      hardNavigate(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить регистрацию.");
      setSubmitting(false);
    }
  };

  if (registrationCode && !error) {
    return (
      <main className="auth-page flex min-h-screen items-center justify-center px-5 py-12">
        <section className="glass-panel w-full max-w-md space-y-5 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">Один шаг до входа</h1>
          <p className="text-sm text-aura-ivory/70">
            {preview
              ? `${preview.name}, подтвердите условия для первого входа через ${preview.providerLabel}.`
              : "Загружаем данные профиля…"}
          </p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-left text-xs leading-relaxed text-gray-300">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Мне есть 18 лет. Я принимаю{" "}
              <a href="/terms" target="_blank" className="underline">соглашение</a>,{" "}
              <a href="/privacy" target="_blank" className="underline">политику данных</a> и{" "}
              <a href="/disclaimer" target="_blank" className="underline">отказ от ответственности</a>.
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-left text-xs text-gray-500">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(event) => setMarketing(event.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span>Получать полезные материалы и предложения</span>
          </label>
          <button
            type="button"
            onClick={() => void completeRegistration()}
            disabled={!accepted || !preview || submitting}
            className="btn-neon w-full py-3 text-sm disabled:opacity-50"
          >
            {submitting ? "Входим…" : "Продолжить"}
          </button>
        </section>
      </main>
    );
  }

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
