"use client";

import { isNativeCapacitorPlatform, shouldUseAppShellClient } from "@/lib/app-shell";
import type { OAuthMode, OAuthProvider } from "@/lib/oauth/types";
import { registerPlugin } from "@capacitor/core";
import { useEffect, useMemo, useState } from "react";
import OAuthProviderIcon, { OAUTH_PROVIDER_BRAND } from "@/components/auth/OAuthProviderIcon";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  consent_required: "Подтвердите согласие с условиями и возраст 18+ перед входом через соцсеть.",
  email_exists: "Email уже зарегистрирован. Войдите через email или используйте другой аккаунт.",
  provider_denied: "Вход через соцсеть отменён.",
  state_mismatch:
    "Сессия OAuth устарела. Если вы входили из приложения — попробуйте снова, не закрывая окно авторизации.",
  start_failed: "Не удалось начать вход через соцсеть.",
  oauth_failed: "Ошибка входа через соцсеть. Попробуйте позже.",
  provider_unavailable: "Этот способ входа временно недоступен.",
  vk_redirect_invalid:
    "VK: не настроен redirect URL. В кабинете VK ID добавьте https://zovus.ru/api/auth/oauth/vk/callback",
};

export function resolveOAuthErrorMessage(code: string | null | undefined): string | null {
  if (!code) return null;
  return OAUTH_ERROR_MESSAGES[code] ?? OAUTH_ERROR_MESSAGES.oauth_failed;
}

interface SocialAuthButtonsProps {
  mode: OAuthMode;
  returnTo: string;
  requireConsent: boolean;
  acceptedTerms: boolean;
  ageConfirmed: boolean;
  marketingConsent: boolean;
  disabled?: boolean;
  consentScrollTargetId?: string;
  showEmailDivider?: boolean;
  emailDividerLabel?: string;
}

async function openNativeOAuth(startUrl: string) {
  const absoluteUrl = new URL(startUrl, window.location.origin).toString();
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
  consentScrollTargetId,
  showEmailDivider = true,
  emailDividerLabel = "или email",
}: SocialAuthButtonsProps) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);
  const [nativeError, setNativeError] = useState("");
  const useNativeOAuth = isNativeCapacitorPlatform();

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
      }
      if (shouldUseAppShellClient()) {
        params.set("app", "1");
      }
      return `/api/auth/oauth/${provider}/start?${params.toString()}`;
    };
  }, [mode, returnTo, acceptedTerms, ageConfirmed, marketingConsent]);

  const handleOAuthClick = (provider: OAuthProvider) => async (e: React.MouseEvent) => {
    if (consentBlocked || disabled) {
      e.preventDefault();
      if (consentScrollTargetId) {
        document.getElementById(consentScrollTargetId)?.scrollIntoView({
          behavior: "smooth",
          block: "center",
        });
      }
      return;
    }
    if (!useNativeOAuth) return;

    e.preventDefault();
    setNativeError("");
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
    }
  };

  if (providers.length === 0) return null;

  return (
    <div className="oauth-provider-buttons space-y-4">
      <div className="flex flex-wrap items-start justify-center gap-8 sm:gap-10">
        {providers.map((provider) => {
          const brand = OAUTH_PROVIDER_BRAND[provider];
          const blocked = consentBlocked || disabled;
          return (
            <a
              key={provider}
              href={blocked ? "#" : startHref(provider)}
              aria-disabled={blocked}
              aria-label={brand.label}
              title={brand.label}
              data-oauth-provider={provider}
              onClick={handleOAuthClick(provider)}
              className={`oauth-provider-button group flex w-[5.5rem] flex-col items-center gap-2.5 no-underline ${
                blocked ? "cursor-not-allowed opacity-45" : ""
              }`}
            >
              <span
                className={`oauth-provider-icon flex h-16 w-16 shrink-0 items-center justify-center rounded-full text-white shadow-lg ring-2 ring-offset-2 ring-offset-[#0a0612] transition duration-200 ${brand.bg} ${brand.ring} ${
                  blocked ? "" : `${brand.hover} group-hover:scale-105 group-active:scale-95`
                }`}
              >
                <OAuthProviderIcon provider={provider} className="h-8 w-8" />
              </span>
              <span className="oauth-provider-label text-center text-xs font-medium leading-tight text-aura-ivory/80">
                {brand.label}
              </span>
            </a>
          );
        })}
      </div>

      {consentBlocked ? (
        <p className="text-center text-xs text-amber-200/85">
          Отметьте согласие с условиями и возраст 18+, затем выберите соцсеть.
        </p>
      ) : null}
      {nativeError ? <p className="text-center text-xs text-red-300">{nativeError}</p> : null}

      {showEmailDivider ? (
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <p className="relative mx-auto w-fit bg-transparent px-3 text-xs text-gray-500">
            {emailDividerLabel}
          </p>
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
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-200/90">
      {message}
    </div>
  );
}
