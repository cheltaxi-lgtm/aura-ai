"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

/** One ceiling for completion work; navigation is chosen only after it settles. */
const OAUTH_COMPLETE_OPERATION_MS = 8_000;

async function ensureAuthenticated(): Promise<AuthMeResponse | null> {
  let me = await fetchAuthMeWithRetry({ attempts: 2, delayMs: 120, timeoutMs: 2_000 });
  if (me?.authenticated) return me;
  return fetchAuthMeWithRetry({ attempts: 2, delayMs: 150, timeoutMs: 2_000 });
}

async function withOperationTimeout<T>(operation: Promise<T>): Promise<T | null> {
  let timer = 0;
  try {
    return await Promise.race([
      operation,
      new Promise<null>((resolve) => {
        timer = window.setTimeout(() => resolve(null), OAUTH_COMPLETE_OPERATION_MS);
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function hardNavigate(destination: string): void {
  const landing = withAppShellAuthParams(destination);
  try {
    window.location.replace(landing);
  } catch {
    window.location.href = landing;
  }
}

function takeHandoffFromLocation(): string | null {
  const url = new URL(window.location.href);
  const params = url.searchParams;
  const fromQuery = params.get("handoff");
  const hashParams = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  const handoff = fromQuery || hashParams.get("handoff");
  if (!handoff) return null;

  // Treat the handoff like a credential: retain it only in memory and remove it
  // before any fetch, bridge, analytics, copy, or manual navigation can expose it.
  params.delete("handoff");
  hashParams.delete("handoff");
  const remainingHash = hashParams.toString();
  url.hash = remainingHash ? `#${remainingHash}` : "";
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  return handoff;
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
  const [fallbackHref, setFallbackHref] = useState("/");

  const navigateOnce = useCallback((destination: string, handoff?: string | null): boolean => {
    if (navigated.current) return false;
    navigated.current = true;
    markAuthPending();
    if (handoff) {
      void navigateViaSessionBridge(destination, handoff)
        .then((bridged) => {
          if (!bridged) hardNavigate(destination);
        })
        .catch(() => hardNavigate(destination));
      return true;
    }
    hardNavigate(destination);
    return true;
  }, []);

  useEffect(() => {
    if (started.current || typeof window === "undefined") return;
    started.current = true;

    const params = new URLSearchParams(window.location.search);
    const locationHandoff = takeHandoffFromLocation();
    const registration = params.get("registration")?.trim();
    if (registration) {
      setRegistrationCode(registration);
      void fetchWithTimeout(`/api/auth/oauth/register?code=${encodeURIComponent(registration)}`, {
        credentials: "include",
        cache: "no-store",
        timeoutMs: OAUTH_COMPLETE_OPERATION_MS,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Ссылка регистрации устарела.");
          setPreview((await response.json()) as RegistrationPreview);
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Ссылка устарела."));
      return;
    }

    const returnTo = sanitizeReturnTo(params.get("returnTo"), "/");
    const mode = params.get("mode") === "register" ? "register" : "login";
    const isNewUser = params.get("new") === "1";
    const needsProfile = params.get("needsProfile") === "1";
    const hasProfileFlag = params.get("hasProfile") === "1";
    const alreadyBridged = params.get("_bridged") === "1";

    let handoffFromStore: string | null = null;
    try {
      handoffFromStore = window.sessionStorage.getItem("aura_oauth_handoff");
      if (handoffFromStore) window.sessionStorage.removeItem("aura_oauth_handoff");
    } catch {
      handoffFromStore = null;
    }
    const handoff = locationHandoff || handoffFromStore;

    const urgentFallback =
      needsProfile || isNewUser ? onboardingRedirectUrl() : returnTo;
    setFallbackHref(withAppShellAuthParams(urgentFallback));

    // A handoff is consumed only by a document response. This avoids the
    // fetch Set-Cookie race on web and WebView alike. Claim navigation before
    // starting it, so no timeout or late async branch can choose another URL.
    if (handoff && !alreadyBridged) {
      const resume = new URL(window.location.href);
      resume.searchParams.set("_bridged", "1");
      if (shouldUseSessionBridge()) resume.searchParams.set("app", "1");
      navigateOnce(`${resume.pathname}${resume.search}${resume.hash}`, handoff);
      return;
    }

    const resolveDestination = async (): Promise<string> => {
      const me = await ensureAuthenticated();
      void flushWebViewCookies().catch(() => undefined);

      if (!me?.authenticated) {
        return urgentFallback;
      }

      let profile: Record<string, unknown> | null = null;
      if (hasProfileFlag && me.user?.profileUserId) {
        try {
          const profileRes = await fetchWithTimeout("/api/cabinet", {
            credentials: "include",
            cache: "no-store",
            timeoutMs: 1_500,
          });
          if (profileRes.ok) {
            profile = ((await profileRes.json()) as { profile?: Record<string, unknown> })
              ?.profile ?? null;
          }
        } catch {
          /* optional */
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

      return finishUserAuthSuccess({
        mode,
        returnTo,
        isNewUser: liveIsNewUser,
        needsProfile: liveNeedsProfile,
        userName: me.user?.name,
        profile,
        oauthGender,
        skipAuthRecheck: true,
      });
    };

    void (async () => {
      try {
        const destination = await withOperationTimeout(resolveDestination());
        navigateOnce(destination ?? urgentFallback);
      } catch {
        navigateOnce(urgentFallback);
      }
    })();

    return () => {
      if (!navigated.current) started.current = false;
    };
  }, [navigateOnce]);

  const completeRegistration = async () => {
    if (!accepted || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetchWithTimeout("/api/auth/oauth/register", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        timeoutMs: OAUTH_COMPLETE_OPERATION_MS,
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

      if (data.handoff && data.appFlow && !isNativeCapacitorPlatform()) {
        const params = new URLSearchParams({
          handoff: data.handoff,
          returnTo: sanitizeReturnTo(data.returnTo, "/"),
          mode: "register",
          new: data.isNewUser ? "1" : "0",
          needsProfile: data.needsProfile ? "1" : "0",
        });
        if (navigated.current) return;
        navigated.current = true;
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
      navigateOnce(destination, typeof data.handoff === "string" ? data.handoff : null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить регистрацию.");
      setSubmitting(false);
    }
  };

  if (registrationCode && !error) {
    return (
      <main className="auth-page flex min-h-screen items-center justify-center bg-[#07060c] px-5 py-12">
        <section className="glass-panel w-full max-w-md space-y-5 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">Один шаг до входа</h1>
          <p className="text-sm text-white/70">
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
              <a href="/terms" target="_blank" className="underline">
                соглашение
              </a>
              ,{" "}
              <a href="/privacy" target="_blank" className="underline">
                политику данных
              </a>{" "}
              и{" "}
              <a href="/disclaimer" target="_blank" className="underline">
                отказ от ответственности
              </a>
              .
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
          <Link
            href="/auth/user/login"
            onClick={() => {
              navigated.current = true;
            }}
            className="block text-sm text-aura-champagne underline"
          >
            Вернуться ко входу
          </Link>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <div className="auth-page flex min-h-screen flex-col items-center justify-center bg-[#07060c] px-6 py-16 text-center">
        <p className="mb-4 text-sm text-red-400">{error}</p>
        <Link href="/auth/user/login" className="text-sm text-aura-champagne underline">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-page flex min-h-screen flex-col items-center justify-center bg-[#07060c] px-6 py-16 text-center">
      <p className="text-sm text-white/80">Завершаем вход…</p>
      <a
        href={fallbackHref}
        onClick={() => {
          navigated.current = true;
        }}
        className="mt-6 text-sm text-aura-champagne underline"
      >
        Если экран не меняется — нажмите сюда
      </a>
    </div>
  );
}
