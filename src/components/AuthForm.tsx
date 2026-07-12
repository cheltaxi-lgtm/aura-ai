"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-policy";
import { getLoginFormHints } from "@/lib/login-hints";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { APP_SHELL_HEADER, shouldUseAppShellClient } from "@/lib/app-shell";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { clearClientAuthState } from "@/lib/client-logout";
import { loadGuestTriplet } from "@/lib/guest-triplet";
import {
  clearNeedsServerProfile,
  markNeedsServerProfile,
} from "@/lib/home-flow-storage";
import {
  captureReturnToFromUrl,
  buildAuthHref,
  onboardingRedirectUrl,
  persistPostAuthReturnTo,
} from "@/lib/post-auth-return";
import {
  trackRegistrationAccountCreated,
  trackRegistrationError,
  trackRegistrationStarted,
} from "@/lib/seo/metrika";

interface AuthFormProps {
  mode: "login" | "register";
  role: "user" | "expert";
}

export default function AuthForm({ mode, role }: AuthFormProps) {
  const router = useRouter();
  const { expertRegistrationEnabled, recaptcha } = usePlatformFeatures();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [returnTo, setReturnTo] = useState("/");

  const isExpert = role === "expert";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("returnTo") ?? params.get("next");
    const fallback = isExpert ? "/expert" : "/";
    const safe = sanitizeReturnTo(raw, fallback);
    setReturnTo(safe);
    captureReturnToFromUrl(window.location.search, fallback);
  }, [isExpert]);

  const loginHref = buildAuthHref(`/auth/${role}/login`, returnTo, isExpert ? "/expert" : "/");
  const registerHref = buildAuthHref(`/auth/${role}/register`, returnTo, isExpert ? "/expert" : "/");

  const isUserRegister = mode === "register" && role === "user";
  const isExpertRegister = mode === "register" && role === "expert";
  const requiresLegalConsent = role === "user";
  const canSubmit =
    !loading &&
    (!requiresLegalConsent || acceptedTerms) &&
    (!isUserRegister && !isExpertRegister || ageConfirmed);
  const showRegisterLink =
    mode === "login" && (role !== "expert" || expertRegistrationEnabled);
  const endpoint = `/api/auth/${role}/${mode === "login" ? "login" : "register"}`;

  const recaptchaScope =
    mode === "login"
      ? isExpert
        ? "expertLogin"
        : "login"
      : isExpert
        ? "expertRegister"
        : "register";
  const showRecaptchaBadge = recaptcha.masterEnabled && recaptcha.scopes[recaptchaScope];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    if (isUserRegister) trackRegistrationStarted("auth_form");

    const body: Record<string, unknown> = { email: email.trim(), password };

    if (mode === "register") {
      body.name = name;
      if (isExpert) {
        body.slug = slug;
        body.title = title;
        if (mode === "register") {
          body.ageConfirmed = ageConfirmed;
        }
      }

      if (isUserRegister) {
        body.sessionId = localStorage.getItem("aura_session_id") ?? undefined;
        body.marketingConsent = marketingConsent;
        body.ageConfirmed = ageConfirmed;
        body.acceptedTerms = acceptedTerms;
      }

      const captchaErr = await attachRecaptchaToken(
        body,
        recaptchaScope,
        { expertRegistrationEnabled, recaptcha }
      );
      if (captchaErr) {
        setError(captchaErr);
        setLoading(false);
        return;
      }
    } else {
      const captchaErr = await attachRecaptchaToken(
        body,
        recaptchaScope,
        { expertRegistrationEnabled, recaptcha }
      );
      if (captchaErr) {
        setError(captchaErr);
        setLoading(false);
        return;
      }
    }

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (shouldUseAppShellClient()) {
        headers[APP_SHELL_HEADER] = "1";
      }
      const res = await fetch(endpoint, {
        method: "POST",
        headers,
        credentials: "include",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "rate_limit") {
          setError(data.message ?? "Слишком много попыток. Подождите и попробуйте снова.");
        } else {
          setError(data.message ?? data.error ?? "Ошибка");
        }
        if (isUserRegister) trackRegistrationError(String(data.error ?? "unknown"));
        return;
      }

      if (typeof window !== "undefined") {
        if (mode === "login" && role !== "user") {
          clearClientAuthState();
          localStorage.setItem("aura_flow_step", "masters");
        } else if (isUserRegister && data.profile && !data.sessionLinked) {
          localStorage.removeItem("aura_session_id");
        }
      }

      if (isUserRegister) {
        trackRegistrationAccountCreated("auth_form");
        const guest = loadGuestTriplet();
        if (data.profile) {
          clearNeedsServerProfile();
          localStorage.setItem(
            "aura_profile",
            JSON.stringify({
              ...data.profile,
              tarotCards: guest?.tarotCards ?? [],
              deckSystem: guest?.deckSystem,
              teaser: guest?.teaser,
            })
          );
          localStorage.setItem("aura_flow_step", guest?.tarotCards?.length ? "masters" : "triplet");
        } else {
          localStorage.setItem(
            "aura_profile",
            JSON.stringify({
              name: name.trim(),
              gender: "female",
              birthDate: "",
              zodiac: "",
              tarotCards: guest?.tarotCards ?? [],
              deckSystem: guest?.deckSystem,
              teaser: guest?.teaser,
              mainQuestion: guest?.question,
              tripletMasterId: guest?.masterId,
            })
          );
          localStorage.setItem("aura_flow_step", "onboarding");
          markNeedsServerProfile();
        }
      }

      let destination = returnTo;

      if (typeof window !== "undefined" && isUserRegister && !data.profile) {
        persistPostAuthReturnTo(destination);
        window.location.assign(onboardingRedirectUrl());
        return;
      }

      if (typeof window !== "undefined" && mode === "login" && role === "user") {
        const meRes = await fetch("/api/auth/me", { credentials: "include" });
        const me = meRes.ok ? await meRes.json() : null;
        const needsProfile = Boolean(me?.needsProfile || !me?.user?.profileUserId);
        if (needsProfile) {
          markNeedsServerProfile();
          persistPostAuthReturnTo(destination);
          localStorage.setItem(
            "aura_profile",
            JSON.stringify({
              name: me?.user?.name ?? "",
              gender: "female",
              birthDate: "",
              zodiac: "",
              tarotCards: [],
            })
          );
          localStorage.setItem("aura_flow_step", "onboarding");
          window.location.assign(onboardingRedirectUrl());
          return;
        }
        clearClientAuthState();
        clearNeedsServerProfile();
        const landing = new URL(destination, window.location.origin);
        landing.searchParams.delete("step");
        destination = `${landing.pathname}${landing.search}${landing.hash}`;
        window.location.assign(destination);
        return;
      }

      router.push(destination);
      router.refresh();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel mx-auto max-w-lg space-y-5 p-8">
      {mode === "register" && (
        <>
          <div>
            <label className="mb-1 block text-xs text-gray-500">Имя *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться?"
              autoComplete="name"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>
          {isExpert && (
            <>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Slug страницы</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="gadalka_marina"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-500">Специализация</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Таро · Расклады"
                  className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
                />
              </div>
            </>
          )}
        </>
      )}

      <div className={isUserRegister ? "border-t border-white/10 pt-5" : ""}>
        <p className={isUserRegister ? "mb-4 text-center text-xs text-gray-500" : "hidden"}>
          Аккаунт для сохранения истории
        </p>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs text-gray-500">Email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Пароль *</label>
            <input
              type="password"
              required
              minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
            {mode === "register" ? (
              <p className="mt-2 text-xs text-gray-500">
                Минимум {MIN_PASSWORD_LENGTH} символов
              </p>
            ) : null}
            {mode === "login" && role === "user" ? (
              <p className="mt-2 text-right">
                <Link
                  href="/auth/user/forgot-password"
                  className="text-xs text-aura-champagne/80 hover:text-aura-champagne hover:underline"
                >
                  Забыли пароль?
                </Link>
              </p>
            ) : null}
          </div>
        </div>
      </div>

      {error && <p className="text-center text-sm text-red-400">{error}</p>}

      {requiresLegalConsent && (
        <div className="space-y-3 rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <div className="flex items-start gap-2.5 text-xs leading-relaxed text-gray-400">
            <input
              id="legal-terms-consent"
              type="checkbox"
              checked={acceptedTerms}
              onChange={(e) => setAcceptedTerms(e.target.checked)}
              required
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
            />
            <p className="m-0">
              <label htmlFor="legal-terms-consent" className="cursor-pointer">
                Я согласен с
              </label>{" "}
              <a
                href="/terms"
                target="_blank"
                rel="noopener noreferrer"
                className="touch-manipulation text-aura-champagne/90 underline underline-offset-2 hover:text-aura-champagne"
              >
                Пользовательским соглашением
              </a>{" "}
              и{" "}
              <a
                href="/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="touch-manipulation text-aura-champagne/90 underline underline-offset-2 hover:text-aura-champagne"
              >
                Политикой обработки персональных данных
              </a>
              . Ознакомлен с{" "}
              <a
                href="/disclaimer"
                target="_blank"
                rel="noopener noreferrer"
                className="touch-manipulation text-aura-champagne/90 underline underline-offset-2 hover:text-aura-champagne"
              >
                отказом от ответственности
              </a>
            </p>
          </div>

          {mode === "register" && (
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-gray-400">
              <input
                id="legal-age-consent"
                type="checkbox"
                checked={ageConfirmed}
                onChange={(e) => setAgeConfirmed(e.target.checked)}
                required
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
              />
              <span>Мне есть 18 лет</span>
            </label>
          )}

          {mode === "register" && (
            <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-gray-500">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
              />
              <span>Я согласен на получение рекламных рассылок</span>
            </label>
          )}
        </div>
      )}

      {showRecaptchaBadge && (
        <p className="text-center text-[10px] text-gray-600">
          Защищено reCAPTCHA. Применяются{" "}
          <a
            href="https://policies.google.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:underline"
          >
            Политика конфиденциальности
          </a>{" "}
          и{" "}
          <a
            href="https://policies.google.com/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-gray-500 hover:underline"
          >
            Условия использования
          </a>{" "}
          Google.
        </p>
      )}

      {mode === "login" ? (
        <ul className="space-y-1 text-xs leading-relaxed text-gray-500">
          {getLoginFormHints(role).map((hint) => (
            <li key={hint}>• {hint}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-neon w-full py-3 text-sm disabled:opacity-50"
      >
        {loading ? "Сохраняем…" : mode === "login" ? "Войти" : "Создать аккаунт и продолжить"}
      </button>

      {(mode === "login" && showRegisterLink) || mode === "register" ? (
        <p className="text-center text-xs text-gray-600">
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <Link href={registerHref} className="btn-luxe btn-luxe--sm btn-luxe--gold">
                Регистрация
              </Link>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <Link href={loginHref} className="btn-luxe btn-luxe--sm btn-luxe--gold">
                Войти
              </Link>
            </>
          )}
        </p>
      ) : null}
    </form>
  );
}
