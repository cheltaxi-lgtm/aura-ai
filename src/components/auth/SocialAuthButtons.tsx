"use client";

import { isNativeCapacitorPlatform, shouldUseAppShellClient } from "@/lib/app-shell";
import type { OAuthMode, OAuthProvider } from "@/lib/oauth/types";
import { registerPlugin } from "@capacitor/core";
import { useEffect, useMemo, useState } from "react";
import OAuthProviderIcon, { OAUTH_PROVIDER_BRAND } from "@/components/auth/OAuthProviderIcon";
import { openTelegramExternalUrl } from "@/components/telegram/TelegramWebAppProvider";
import { trackAuthProviderClick, trackRegistrationStarted } from "@/lib/seo/metrika";
import { resolveRegistrationSource } from "@/lib/share/registration-attribution";
import { readUtmAttribution } from "@/lib/utm/attribution";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  consent_required: "Подтвердите согласие с условиями и возраст 18+ перед входом через соцсеть.",
  email_exists: "Email уже зарегистрирован. Войдите через email или используйте другой аккаунт.",
  provider_denied: "Вход через соцсеть отменён.",
  provider_taken: "Этот Яндекс или VK уже привязан к другому аккаунту Zovus.",
  auth_required: "Сначала откройте кабинет из бота, затем привяжите способ входа.",
  state_mismatch:
    "Сессия входа через соцсеть устарела. Если вы входили из приложения — попробуйте снова, не закрывая окно авторизации.",
  start_failed: "Не удалось начать вход через соцсеть.",
  oauth_failed: "Ошибка входа через соцсеть. Попробуйте позже.",
  provider_unavailable: "Этот способ входа временно недоступен.",
  vk_device_id_required:
    "VK не вернул идентификатор устройства. Нажмите «Продолжить с VK» ещё раз — обычно со второго раза вход завершается.",
  vk_device_id_invalid:
    "VK отклонил идентификатор устройства. Нажмите «Продолжить с VK» ещё раз.",
  session_lost:
    "Не удалось сохранить сессию после входа через соцсеть. Попробуйте ещё раз — если открыт Яндекс.Браузер, отключите блокировку cookies для zovus.ru.",
  vk_redirect_invalid:
    "Вход через VK временно недоступен. Попробуйте Яндекс или email — либо напишите в поддержку.",
};

export function resolveOAuthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? OAUTH_ERROR_MESSAGES.oauth_failed;
}

const CONTINUE_LABEL: Record<OAuthProvider, string> = {
  yandex: "Продолжить с Яндекс",
  vk: "Продолжить с VK",
};

const LINK_LABEL: Record<OAuthProvider, string> = {
  yandex: "Привязать Яндекс",
  vk: "Привязать VK",
};

const PROVIDER_SHORT: Record<OAuthProvider, string> = {
  yandex: "Яндекс",
  vk: "VK",
};

interface SocialAuthButtonsProps {
  mode: OAuthMode;
  returnTo: string;
  requireConsent: boolean;
  acceptedTerms: boolean;
  ageConfirmed: boolean;
  marketingConsent: boolean;
  disabled?: boolean;
  /** Providers already attached — buttons stay visible but inactive. */
  linkedProviders?: OAuthProvider[];
  consentScrollTargetId?: string;
  showEmailDivider?: boolean;
  emailDividerLabel?: string;
}

async function openNativeOAuth(startUrl: string) {
  const { appShellNavigationOrigin } = await import("@/lib/app-shell");
  const absoluteUrl = new URL(startUrl, appShellNavigationOrigin()).toString();
  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: absoluteUrl });
}

type VkAuthPlugin = {
  signIn(): Promise<{ accessToken: string }>;
};

const nativeVkAuth = registerPlugin<VkAuthPlugin>("VkAuth");

export default function SocialAuthButtons({
  mode,
  returnTo,
  requireConsent,
  acceptedTerms,
  ageConfirmed,
  marketingConsent,
  disabled = false,
  linkedProviders = [],
  consentScrollTargetId,
  showEmailDivider = true,
  emailDividerLabel = "или по email",
}: SocialAuthButtonsProps) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [nativeError, setNativeError] = useState("");
  const [pendingProvider, setPendingProvider] = useState<OAuthProvider | null>(null);
  const useNativeOAuth = isNativeCapacitorPlatform();
  const linkedSet = useMemo(() => new Set(linkedProviders), [linkedProviders]);

  useEffect(() => {
    void fetch("/api/auth/oauth/providers")
      .then((r) => (r.ok ? r.json() : { providers: [] }))
      .then((d) => setProviders(Array.isArray(d.providers) ? d.providers : []))
      .catch(() => setProviders([]));
  }, []);

  const consentBlocked = requireConsent && (!acceptedTerms || !ageConfirmed);

  const startHref = useMemo(() => {
    return (provider: OAuthProvider) => {
      const params = new URLSearchParams({
        mode,
        returnTo,
        acceptedTerms: acceptedTerms ? "1" : "0",
        ageConfirmed: ageConfirmed ? "1" : "0",
        marketingConsent: marketingConsent ? "1" : "0",
      });
      if (typeof window !== "undefined") {
        const sessionId = localStorage.getItem("aura_session_id");
        if (sessionId) params.set("sessionId", sessionId);
        const attribution = readUtmAttribution();
        if (attribution) params.set("attribution", JSON.stringify(attribution));
      }
      if (shouldUseAppShellClient()) {
        params.set("app", "1");
      }
      return `/api/auth/oauth/${provider}/start?${params.toString()}`;
    };
  }, [mode, returnTo, acceptedTerms, ageConfirmed, marketingConsent]);

  const handleOAuthClick = (provider: OAuthProvider) => async (e: React.MouseEvent) => {
    if (linkedSet.has(provider) || consentBlocked || disabled || pendingProvider) {
      e.preventDefault();
      if (consentBlocked && consentScrollTargetId && !linkedSet.has(provider)) {
        document.getElementById(consentScrollTargetId)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    if (mode === "register") {
      trackRegistrationStarted(resolveRegistrationSource(`oauth_${provider}`));
      trackAuthProviderClick(provider);
    }

    // Mini App WebView breaks OAuth redirects — open provider flow in system browser.
    const inTelegramMiniApp =
      typeof window !== "undefined" &&
      (Boolean(window.Telegram?.WebApp?.initData) ||
        document.documentElement.dataset.telegramWebApp === "1");
    if (inTelegramMiniApp && !useNativeOAuth) {
      e.preventDefault();
      const abs = new URL(startHref(provider), window.location.origin).toString();
      openTelegramExternalUrl(abs);
      return;
    }

    if (!useNativeOAuth) return;

    e.preventDefault();
    setNativeError("");
    setPendingProvider(provider);
    try {
      if (provider === "vk") {
        const { accessToken } = await nativeVkAuth.signIn();
        const response = await fetch("/api/auth/oauth/vk/native", {
          method: "POST",
          credentials: "include",
          cache: "no-store",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accessToken,
            mode,
            returnTo,
            sessionId: localStorage.getItem("aura_session_id"),
            acceptedTerms,
            ageConfirmed,
            marketingConsent,
            attribution: readUtmAttribution() ?? undefined,
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error("native_vk_failed");
        if (result.registration) {
          window.location.assign(
            `/auth/oauth/complete?registration=${encodeURIComponent(result.registration)}`
          );
          return;
        }
        const params = new URLSearchParams({
          returnTo: result.returnTo || returnTo,
          mode: result.mode === "register" ? "register" : "login",
          new: result.isNewUser ? "1" : "0",
          needsProfile: result.needsProfile ? "1" : "0",
        });
        if (result.hasProfile) params.set("hasProfile", "1");
        if (typeof result.handoff === "string" && result.handoff.trim()) {
          try {
            window.sessionStorage.setItem("aura_oauth_handoff", result.handoff.trim());
          } catch {
            // Fall back to fragment (not query) if storage is unavailable.
            window.location.assign(
              `/auth/oauth/complete?${params.toString()}#handoff=${encodeURIComponent(result.handoff.trim())}`
            );
            return;
          }
        }
        window.location.assign(`/auth/oauth/complete?${params.toString()}`);
        return;
      }
      await openNativeOAuth(startHref(provider));
    } catch {
      if (provider === "vk") {
        setNativeError("Обновите приложение и повторите вход через VK.");
      } else {
        window.location.assign(startHref(provider));
      }
    } finally {
      setPendingProvider(null);
    }
  };

  // Prefer Yandex then VK for a stable visual order when both are enabled.
  const ordered = [...providers].sort((a, b) => {
    const rank = (p: OAuthProvider) => (p === "yandex" ? 0 : p === "vk" ? 1 : 2);
    return rank(a) - rank(b);
  });

  return (
    <div className="oauth-provider-buttons space-y-3">
      {ordered.length > 0 ? (
        <div className="auth-salon-oauth">
          {ordered.map((provider) => {
            const brand = OAUTH_PROVIDER_BRAND[provider];
            const alreadyLinked = linkedSet.has(provider);
            const blocked =
              alreadyLinked || consentBlocked || disabled || Boolean(pendingProvider);
            const busy = pendingProvider === provider;
            const labels = mode === "link" ? LINK_LABEL : CONTINUE_LABEL;
            const label = alreadyLinked
              ? `${PROVIDER_SHORT[provider]} привязан`
              : labels[provider] ?? brand.label;
            return (
              <a
                key={provider}
                href={blocked ? undefined : startHref(provider)}
                aria-disabled={blocked}
                aria-busy={busy || undefined}
                aria-label={label}
                title={alreadyLinked ? "Уже привязан к этому аккаунту" : label}
                data-oauth-provider={provider}
                onClick={handleOAuthClick(provider)}
                className={`auth-salon-oauth-btn${alreadyLinked ? " opacity-45 pointer-events-none cursor-default" : ""}`}
                tabIndex={alreadyLinked ? -1 : undefined}
              >
                <span className={`auth-salon-oauth-icon ${brand.bg}`}>
                  <OAuthProviderIcon provider={provider} className="h-4 w-4" />
                </span>
                <span className="auth-salon-oauth-label">
                  {busy ? "Открываем…" : label}
                </span>
              </a>
            );
          })}
        </div>
      ) : null}

      {consentBlocked ? (
        <p className="auth-salon-hint text-center">
          {ageConfirmed
            ? "Подтвердите согласие с условиями, чтобы продолжить"
            : "Подтвердите возраст и согласие с условиями, чтобы продолжить"}
        </p>
      ) : null}
      {nativeError ? <p className="text-center text-xs text-red-300">{nativeError}</p> : null}

      {showEmailDivider ? (
        <div className="auth-salon-divider">
          <span>{emailDividerLabel}</span>
        </div>
      ) : null}
    </div>
  );
}

export function OAuthErrorBanner({ code, returnTo }: { code?: string | null; returnTo?: string }) {
  void returnTo;
  const message = resolveOAuthErrorMessage(code ?? null);
  if (!message) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-400/25 bg-amber-400/[0.08] px-4 py-3 text-center text-sm text-amber-100/90"
    >
      {message}
    </div>
  );
}
