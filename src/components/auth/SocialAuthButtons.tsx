"use client";

import { useEffect, useMemo, useState } from "react";
import type { OAuthMode, OAuthProvider } from "@/lib/oauth/types";
import { OAUTH_PROVIDER_LABELS } from "@/lib/oauth/types";
import { buildAuthHref } from "@/lib/post-auth-return";

const PROVIDER_STYLES: Record<OAuthProvider, string> = {
  yandex: "border-[#fc3f1d]/40 bg-[#fc3f1d]/10 hover:bg-[#fc3f1d]/20",
  vk: "border-[#0077ff]/40 bg-[#0077ff]/10 hover:bg-[#0077ff]/20",
  mailru: "border-[#005ff9]/40 bg-[#005ff9]/10 hover:bg-[#005ff9]/20",
};

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  consent_required: "Подтвердите согласие с условиями и возраст 18+ перед входом через соцсеть.",
  email_exists: "Email уже зарегистрирован. Войдите через email или используйте другой аккаунт.",
  provider_denied: "Вход через соцсеть отменён.",
  state_mismatch: "Сессия OAuth устарела. Попробуйте снова.",
  start_failed: "Не удалось начать вход через соцсеть.",
  oauth_failed: "Ошибка входа через соцсеть. Попробуйте позже.",
  provider_unavailable: "Этот способ входа временно недоступен.",
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
}

export default function SocialAuthButtons({
  mode,
  returnTo,
  requireConsent,
  acceptedTerms,
  ageConfirmed,
  marketingConsent,
  disabled = false,
}: SocialAuthButtonsProps) {
  const [providers, setProviders] = useState<OAuthProvider[]>([]);

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
      return `/api/auth/oauth/${provider}/start?${params.toString()}`;
    };
  }, [mode, returnTo, acceptedTerms, ageConfirmed, marketingConsent]);

  if (providers.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-3">
        {providers.map((provider) => (
          <a
            key={provider}
            href={consentBlocked || disabled ? "#" : startHref(provider)}
            aria-disabled={consentBlocked || disabled}
            onClick={(e) => {
              if (consentBlocked || disabled) e.preventDefault();
            }}
            className={`flex items-center justify-center rounded-xl border px-3 py-2.5 text-center text-xs font-medium text-white transition ${
              PROVIDER_STYLES[provider]
            } ${consentBlocked || disabled ? "cursor-not-allowed opacity-50" : ""}`}
          >
            {OAUTH_PROVIDER_LABELS[provider]}
          </a>
        ))}
      </div>
      {consentBlocked ? (
        <p className="text-center text-xs text-gray-500">
          Для входа через соцсеть подтвердите согласие и возраст 18+
        </p>
      ) : null}
      <div className="relative py-1">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-white/10" />
        </div>
        <p className="relative mx-auto w-fit bg-transparent px-3 text-xs text-gray-500">или email</p>
      </div>
    </div>
  );
}

export function OAuthErrorBanner({ code, returnTo }: { code?: string | null; returnTo?: string }) {
  const message = resolveOAuthErrorMessage(code ?? null);
  if (!message) return null;
  const registerHref = buildAuthHref("/auth/user/register", returnTo);
  return (
    <div className="rounded-xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-200/90">
      {message}
      {code === "consent_required" ? (
        <>
          {" "}
          <a href={registerHref} className="underline underline-offset-2">
            Перейти к регистрации
          </a>
        </>
      ) : null}
    </div>
  );
}
