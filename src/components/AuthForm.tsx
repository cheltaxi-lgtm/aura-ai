"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-policy";
import { isAgeGateConfirmed, fetchServerAgeGateConfirmed } from "@/lib/age-gate";
import {
  PASSWORD_STRENGTH_COLORS,
  PASSWORD_STRENGTH_LABELS,
  scorePasswordStrength,
} from "@/lib/password-strength";
import { getLoginFormHints } from "@/lib/login-hints";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { APP_SHELL_HEADER, shouldUseAppShellClient } from "@/lib/app-shell";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { preloadRecaptchaScript } from "@/lib/useRecaptcha";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { commitAuthSession } from "@/lib/client-auth-commit";
import { markAuthPending, withAppShellAuthParams } from "@/lib/auth-pending";
import { clearClientAuthState } from "@/lib/client-logout";
import { navigateViaSessionBridge, shouldUseSessionBridge } from "@/lib/session-bridge";
import { pickUserFacingError } from "@/lib/user-facing-error";
import { loadGuestTriplet } from "@/lib/guest-triplet";
import {
  hasActiveGuestResumeIntent,
  loadGuestResumeUiCache,
} from "@/lib/guest-resume-ui-cache";
import {
  clearNeedsServerProfile,
  clearPendingMasterResume,
  hasGuestExplicitMasterResume,
  markNeedsServerProfile,
  PENDING_MASTER_KEY,
} from "@/lib/home-flow-storage";
import {
  captureReturnToFromUrl,
  buildAuthHref,
  onboardingRedirectUrl,
  persistPostAuthReturnTo,
  persistPendingGuestQuestion,
  readPostAuthReturnTo,
  resolveGuestSpreadMasterId,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import {
  clearShareRegistrationAttribution,
  resolveRegistrationSource,
} from "@/lib/share/registration-attribution";
import { readUtmAttribution } from "@/lib/utm/attribution";
import {
  trackAuthEmailView,
  trackRegistrationAccountCreated,
  trackRegistrationCompleted,
  trackRegistrationError,
  trackRegistrationStarted,
  trackSeoEvent,
} from "@/lib/seo/metrika";
import SocialAuthButtons, { OAuthErrorBanner } from "@/components/auth/SocialAuthButtons";
import OAuthConsentFields from "@/components/auth/OAuthConsentFields";
import type { OAuthMode } from "@/lib/oauth/types";

interface AuthFormProps {
  mode: "login" | "register";
  role: "user" | "expert";
}

export default function AuthForm({ mode, role }: AuthFormProps) {
  const router = useRouter();
  const { expertRegistrationEnabled, recaptcha, featuresLoaded } = usePlatformFeatures();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [ageConfirmedLocked, setAgeConfirmedLocked] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [optionalBirthDate, setOptionalBirthDate] = useState("");
  const [optionalGender, setOptionalGender] = useState<"male" | "female">("female");
  const [emailExists, setEmailExists] = useState(false);
  const [error, setError] = useState("");
  const [recaptchaFailed, setRecaptchaFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [returnTo, setReturnTo] = useState("/");
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [showEmailRegister, setShowEmailRegister] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [guestConversion, setGuestConversion] = useState(false);

  const isExpert = role === "expert";
  const isUserRegister = mode === "register" && role === "user";
  const recaptchaScope =
    mode === "login"
      ? isExpert
        ? "expertLogin"
        : "login"
      : isExpert
        ? "expertRegister"
        : "register";

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("returnTo") ?? params.get("next") ?? readPostAuthReturnTo();
    const fallback = isExpert ? "/expert" : "/";
    const safe = sanitizeReturnTo(raw, fallback);
    setReturnTo(safe);
    captureReturnToFromUrl(window.location.search, fallback);
    if (isUserRegister) {
      const authProduct = safe.includes("photo=1")
        ? "photo"
        : safe.includes("dizayn-cheloveka")
          ? "hd"
          : safe.includes("natalnaya-karta")
            ? "natal"
            : safe.includes("numerology")
              ? "matrix"
              : null;
      if (authProduct === "photo") {
        trackSeoEvent("photo_auth_view");
      }
      if (authProduct) {
        trackSeoEvent("starter_auth_view", { product: authProduct });
      }
    }
    if (role === "user") {
      setGuestConversion(hasActiveGuestResumeIntent());
      if (isAgeGateConfirmed()) {
        setAgeConfirmed(true);
        setAgeConfirmedLocked(true);
      }
      void fetchServerAgeGateConfirmed().then((ok) => {
        if (!ok) return;
        setAgeConfirmed(true);
        setAgeConfirmedLocked(true);
      });
    }
    const oauthErr = params.get("oauthError");
    if (oauthErr) {
      setOauthError(oauthErr);
      if (oauthErr === "consent_required") {
        setShowEmailRegister(false);
        requestAnimationFrame(() => {
          document.getElementById("oauth-consent-block")?.scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
        });
      }
      if (oauthErr === "email_exists") {
        setShowEmailRegister(true);
      }
    }
    if (params.get("method") === "email") {
      setShowEmailRegister(true);
      if (isUserRegister) trackAuthEmailView("auth_form");
    }
  }, [isExpert, isUserRegister, role]);

  useEffect(() => {
    document.body.classList.add("auth-recaptcha-hidden");
    return () => document.body.classList.remove("auth-recaptcha-hidden");
  }, []);

  useEffect(() => {
    if (!featuresLoaded || shouldUseAppShellClient() || (isUserRegister && !showEmailRegister)) return;
    if (recaptcha.masterEnabled && recaptcha.scopes[recaptchaScope]) {
      preloadRecaptchaScript();
    }
  }, [featuresLoaded, recaptcha, recaptchaScope, isUserRegister, showEmailRegister]);

  const loginHref = buildAuthHref(`/auth/${role}/login`, returnTo, isExpert ? "/expert" : "/");
  const registerHref = buildAuthHref(`/auth/${role}/register`, returnTo, isExpert ? "/expert" : "/");

  const isExpertRegister = mode === "register" && role === "expert";
  const requiresLegalConsent = role === "user";
  const canSubmit =
    featuresLoaded &&
    !loading &&
    (!requiresLegalConsent || (acceptedTerms && ageConfirmed)) &&
    (!isExpertRegister || ageConfirmed);
  const showRegisterLink =
    mode === "login" && (role !== "expert" || expertRegistrationEnabled);
  const endpoint = `/api/auth/${role}/${mode === "login" ? "login" : "register"}`;

  const passwordStrength = useMemo(
    () => (mode === "register" ? scorePasswordStrength(password) : null),
    [mode, password]
  );

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setError("");
    setEmailExists(false);
    setRecaptchaFailed(false);
    setLoading(true);
    if (isUserRegister) trackRegistrationStarted(resolveRegistrationSource("auth_form"));

    const body: Record<string, unknown> = { email: email.trim(), password };

    if (role === "user") {
      body.ageConfirmed = ageConfirmed;
      body.acceptedTerms = acceptedTerms;
    }

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
        const attribution = readUtmAttribution();
        if (attribution) body.attribution = attribution;
        if (optionalBirthDate.trim()) {
          body.gender = optionalGender;
          body.birthDate = optionalBirthDate.trim();
        }
      }

      const captchaErr = await attachRecaptchaToken(
        body,
        recaptchaScope,
        { expertRegistrationEnabled, recaptcha }
      );
      if (captchaErr) {
        setError(captchaErr);
        if (isUserRegister) trackRegistrationError("recaptcha_client");
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
        if (isUserRegister) trackRegistrationError("recaptcha_client");
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
        cache: "no-store",
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409 && isUserRegister) {
          setEmailExists(true);
          trackRegistrationError("email_exists");
          return;
        }
        if (data.error === "rate_limit") {
          setError(
            pickUserFacingError(data, "Слишком много попыток. Подождите и попробуйте снова.")
          );
        } else if (data.code === "recaptcha_failed") {
          setRecaptchaFailed(true);
          setError(
            pickUserFacingError(
              data,
              "Проверка безопасности не прошла. Нажмите «Повторить» или обновите страницу."
            )
          );
          if (isUserRegister) trackRegistrationError("recaptcha_failed");
        } else {
          setError(pickUserFacingError(data, "Не удалось войти. Попробуйте снова."));
        }
        if (isUserRegister && data.code !== "recaptcha_failed") {
          trackRegistrationError(String(data.error ?? "unknown"));
        }
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

      let guestRegisterMasterId: string | null = null;
      let guestRegisterHasCards = false;

      if (isUserRegister) {
        const regSource = resolveRegistrationSource("auth_form");
        trackRegistrationAccountCreated(regSource);
        const guest = loadGuestTriplet();
        const uiCache = hasActiveGuestResumeIntent() ? loadGuestResumeUiCache() : null;
        const guestMasterId = resolveGuestSpreadMasterId(
          guest?.masterId || uiCache?.masterId
        );
        const guestCards =
          guest?.tarotCards?.length
            ? guest.tarotCards
            : uiCache?.cards?.map((c) => ({ id: c.id, name: c.name, meaning: "" })) ?? [];
        const hasGuestCards = guestCards.length >= 3;
        guestRegisterMasterId = guestMasterId;
        guestRegisterHasCards = hasGuestCards;

        if (data.profile) {
          trackRegistrationCompleted(regSource);
          if (typeof data.starterRunes === "number" && data.starterRunes > 0) {
            trackSeoEvent("starter_runes_granted", { source: "email", amount: data.starterRunes });
          }
          clearShareRegistrationAttribution();
          clearNeedsServerProfile();
          const mergedProfile = {
            ...data.profile,
            tarotCards: guestCards.length ? guestCards : data.profile.tarotCards ?? [],
            deckSystem: guest?.deckSystem ?? uiCache?.system ?? data.profile.deckSystem,
            teaser: guest?.teaser ?? uiCache?.teaser ?? data.profile.teaser,
            mainQuestion:
              guest?.question || uiCache?.question || data.profile.mainQuestion,
            tripletMasterId: guestMasterId,
          };
          localStorage.setItem("aura_profile", JSON.stringify(mergedProfile));
          if (hasGuestCards) {
            localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
            localStorage.setItem("aura_flow_step", "masters");
          } else if (!hasGuestExplicitMasterResume()) {
            clearPendingMasterResume();
            localStorage.setItem("aura_flow_step", "triplet");
          } else {
            localStorage.setItem("aura_flow_step", "triplet");
          }
        } else {
          localStorage.setItem(
            "aura_profile",
            JSON.stringify({
              name: name.trim(),
              gender: "female",
              birthDate: "",
              zodiac: "",
              tarotCards: guestCards,
              deckSystem: guest?.deckSystem ?? uiCache?.system,
              teaser: guest?.teaser ?? uiCache?.teaser,
              mainQuestion: guest?.question || uiCache?.question,
              tripletMasterId: guestMasterId,
            })
          );
          if (hasGuestCards) {
            localStorage.setItem(PENDING_MASTER_KEY, guestMasterId);
          }
          localStorage.setItem("aura_flow_step", "onboarding");
          markNeedsServerProfile();
        }
      }

      let destination = returnTo;

      if (typeof window !== "undefined" && isUserRegister && guestRegisterHasCards) {
        const guest = loadGuestTriplet();
        const uiCache = loadGuestResumeUiCache();
        const guestMasterId =
          guestRegisterMasterId ??
          resolveGuestSpreadMasterId(guest?.masterId || uiCache?.masterId);
        destination = resolveRegistrationReturnTo({
          guestSpread: true,
          guestMasterId,
          guestQuestion: guest?.question || uiCache?.question,
        });
        const q = guest?.question?.trim() || uiCache?.question?.trim();
        if (q) {
          persistPendingGuestQuestion(q);
        }
        // Guest resume: server receipt + cookies are authoritative. Do not clear UI cache here.
      }

      // Guest Tarot: never route through birth onboarding before full reading.
      if (typeof window !== "undefined" && isUserRegister && guestRegisterHasCards) {
        window.location.assign(destination);
        return;
      }

      // Non-guest register without profile row (legacy) → progressive birth onboarding.
      if (typeof window !== "undefined" && isUserRegister && !data.profile) {
        persistPostAuthReturnTo(destination);
        window.location.assign(onboardingRedirectUrl());
        return;
      }

      if (typeof window !== "undefined" && mode === "login" && role === "user") {
        const handoff =
          typeof data.handoff === "string" ? data.handoff : null;
        // Keep handoff for document bridge — do not consume it in XHR commit.
        const me = await commitAuthSession(
          shouldUseSessionBridge() ? undefined : { handoff }
        );
        // Only trust needsProfile when cookie is confirmed. If WebView lags,
        // still hard-navigate — document load commits Set-Cookie from login.
        if (me?.authenticated) {
          const needsProfile = Boolean(me.needsProfile || !me.user?.profileUserId);
          if (needsProfile) {
            markNeedsServerProfile();
            persistPostAuthReturnTo(destination);
            localStorage.setItem(
              "aura_profile",
              JSON.stringify({
                name: me.user?.name ?? "",
                gender: "female",
                birthDate: "",
                zodiac: "",
                tarotCards: [],
              })
            );
            localStorage.setItem("aura_flow_step", "onboarding");
            const onboarding = onboardingRedirectUrl();
            if (
              shouldUseSessionBridge() &&
              (await navigateViaSessionBridge(onboarding, handoff))
            ) {
              return;
            }
            window.location.assign(onboarding);
            return;
          }
        }
        clearClientAuthState();
        clearNeedsServerProfile();
        markAuthPending();
        const landing = new URL(destination, window.location.origin);
        landing.searchParams.delete("step");
        destination = withAppShellAuthParams(
          `${landing.pathname}${landing.search}${landing.hash}`
        );
        window.dispatchEvent(new CustomEvent("aura:login"));
        if (
          shouldUseSessionBridge() &&
          (await navigateViaSessionBridge(destination, handoff))
        ) {
          return;
        }
        // Brief pause so WebView can flush Set-Cookie before document navigation.
        if (!me?.authenticated) {
          await new Promise((resolve) => window.setTimeout(resolve, 450));
        }
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

  const legalConsentFields =
    requiresLegalConsent ? (
      <div
        id="oauth-consent-block"
        className={
          oauthError === "consent_required"
            ? "rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3.5"
            : ""
        }
      >
        <OAuthConsentFields
          acceptedTerms={acceptedTerms}
          ageConfirmed={ageConfirmed}
          marketingConsent={marketingConsent}
          onAcceptedTermsChange={(value) => {
            setAcceptedTerms(value);
            if (oauthError === "consent_required") setOauthError(null);
          }}
          onAgeConfirmedChange={(value) => {
            setAgeConfirmed(value);
            if (oauthError === "consent_required") setOauthError(null);
          }}
          onMarketingConsentChange={setMarketingConsent}
          showMarketing={mode === "register" && !guestConversion}
          showDisclaimer
          ageConfirmedLocked={ageConfirmedLocked}
          termsId="legal-terms-consent"
          ageId="legal-age-consent"
        />
      </div>
    ) : null;

  const isUserLogin = mode === "login" && role === "user";
  const fieldClass = isUserLogin || isUserRegister
    ? "auth-salon-field"
    : "w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white";
  const labelClass = isUserLogin || isUserRegister
    ? "auth-salon-label"
    : "mb-1 block text-xs text-gray-500";
  const formShellClass =
    isUserLogin || isUserRegister
      ? "auth-form space-y-3 sm:space-y-5"
      : "auth-form glass-panel mx-auto max-w-lg space-y-5 p-8";

  if (isUserRegister && !showEmailRegister) {
    return (
      <div className={formShellClass}>
        <OAuthErrorBanner code={oauthError} returnTo={returnTo} />
        {legalConsentFields}
        <SocialAuthButtons
          mode="register"
          returnTo={returnTo}
          requireConsent
          acceptedTerms={acceptedTerms}
          ageConfirmed={ageConfirmed}
          marketingConsent={marketingConsent}
          disabled={loading}
          consentScrollTargetId="oauth-consent-block"
          showEmailDivider={false}
        />
        <button
          type="button"
          onClick={() => {
            setShowEmailRegister(true);
            trackAuthEmailView("auth_form");
          }}
          className="btn-ghost w-full py-3 text-sm"
        >
          Продолжить по email
        </button>
        <p className="text-center text-sm text-aura-ivory/55">
          Уже есть аккаунт?{" "}
          <Link
            href={loginHref}
            className="font-medium text-aura-champagne underline-offset-2 hover:underline"
          >
            Войти
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className={formShellClass}>
      {isUserRegister ? (
        <button
          type="button"
          onClick={() => setShowEmailRegister(false)}
          className="text-xs text-aura-ivory/50 transition hover:text-aura-champagne"
        >
          ← Другой способ входа
        </button>
      ) : null}
      {role === "user" && !isUserRegister ? (
        <>
          <OAuthErrorBanner code={oauthError} returnTo={returnTo} />
          {legalConsentFields}
          <SocialAuthButtons
            mode={mode as OAuthMode}
            returnTo={returnTo}
            requireConsent
            acceptedTerms={acceptedTerms}
            ageConfirmed={ageConfirmed}
            marketingConsent={marketingConsent}
            disabled={loading}
            consentScrollTargetId="oauth-consent-block"
            emailDividerLabel="или по email"
          />
        </>
      ) : null}
      {mode === "register" && !isUserRegister ? (
        <>
          <div>
            <label htmlFor={`${role}-${mode}-name`} className={labelClass}>Имя *</label>
            <input
              id={`${role}-${mode}-name`}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться?"
              autoComplete="name"
              className={fieldClass}
            />
          </div>
          {isExpert && (
            <>
              <div>
                <label className={labelClass}>Адрес страницы</label>
                <input
                  type="text"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="gadalka_marina"
                  className={fieldClass}
                />
              </div>
              <div>
                <label className={labelClass}>Специализация</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Таро · Расклады"
                  className={fieldClass}
                />
              </div>
            </>
          )}
        </>
      ) : null}

      {mode === "register" && isUserRegister ? (
        <>
          <div>
            <label htmlFor={`${role}-${mode}-name`} className={labelClass}>Имя *</label>
            <input
              id={`${role}-${mode}-name`}
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Как к вам обращаться?"
              autoComplete="name"
              className={fieldClass}
            />
          </div>
        </>
      ) : null}

      <div>
        <div className="space-y-4">
          <div>
            <label htmlFor={`${role}-${mode}-email`} className={labelClass}>
              Email *
            </label>
            <input
              id={`${role}-${mode}-email`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={fieldClass}
            />
          </div>

          <div>
            <div className="mb-1 flex items-end justify-between gap-3">
              <label htmlFor={`${role}-${mode}-password`} className={`${labelClass} mb-0`}>
                Пароль *
              </label>
              {mode === "login" && role === "user" ? (
                <Link
                  href="/auth/user/forgot-password"
                  className="shrink-0 text-xs text-aura-champagne/85 hover:text-aura-champagne hover:underline"
                >
                  Забыли пароль?
                </Link>
              ) : null}
            </div>
            <div className="auth-salon-password-wrap">
              <input
                id={`${role}-${mode}-password`}
                type={showPassword ? "text" : "password"}
                required
                minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "register" ? "new-password" : "current-password"}
                className={fieldClass}
              />
              <button
                type="button"
                className="auth-salon-password-toggle"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Скрыть пароль" : "Показать пароль"}
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {mode === "register" ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-aura-ivory/45">Минимум {MIN_PASSWORD_LENGTH} символов</p>
                {password.length > 0 && passwordStrength ? (
                  <p className={`text-xs ${PASSWORD_STRENGTH_COLORS[passwordStrength]}`}>
                    Надёжность: {PASSWORD_STRENGTH_LABELS[passwordStrength]}
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isUserRegister ? (
        <details className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <summary className="cursor-pointer text-sm text-aura-ivory/55">
            Дата рождения — необязательно
          </summary>
          <div className="mt-4 space-y-3">
            <p className="text-xs leading-relaxed text-aura-ivory/45">
              Нужна для натальной карты, Матрицы судьбы и Human Design. Для Таро можно пропустить —
              спросим позже.
            </p>
            <div>
              <label className={labelClass}>Дата рождения</label>
              <input
                type="date"
                aria-label="Дата рождения"
                value={optionalBirthDate}
                onChange={(e) => setOptionalBirthDate(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Пол</label>
              <select
                value={optionalGender}
                aria-label="Пол"
                onChange={(e) => setOptionalGender(e.target.value as "male" | "female")}
                className={fieldClass}
              >
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
              </select>
            </div>
          </div>
        </details>
      ) : null}

      {isUserRegister ? legalConsentFields : null}

      <div className="auth-salon-error-slot space-y-2 text-center" aria-live="polite">
        {emailExists ? (
          <p className="text-sm text-amber-200/90">
            Этот email уже зарегистрирован.{" "}
            <Link href={loginHref} className="text-aura-champagne underline underline-offset-2">
              Войти в аккаунт
            </Link>
          </p>
        ) : error ? (
          <div className="space-y-2">
            <p className="text-sm text-red-300">{error}</p>
            {recaptchaFailed ? (
              <button
                type="button"
                onClick={() => void handleSubmit()}
                className="text-sm text-aura-champagne underline underline-offset-2 hover:text-white"
              >
                Повторить проверку
              </button>
            ) : null}
            {mode === "login" ? (
              <ul className="space-y-1 text-xs leading-relaxed text-aura-ivory/45">
                {getLoginFormHints(role).map((hint) => (
                  <li key={hint}>• {hint}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </div>

      {mode === "login" && role !== "user" ? legalConsentFields : null}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary w-full py-3.5 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-45"
      >
        {loading
          ? mode === "login"
            ? "Входим…"
            : "Сохраняем…"
          : mode === "login"
            ? "Войти"
            : isUserRegister
              ? "Создать аккаунт и открыть разбор"
              : "Создать аккаунт"}
      </button>
      {!canSubmit && requiresLegalConsent && (!acceptedTerms || !ageConfirmed) && !loading ? (
        <p className="auth-salon-hint -mt-2 text-center">
          {ageConfirmed
            ? "Подтвердите согласие с условиями, чтобы продолжить"
            : "Подтвердите возраст и согласие с условиями, чтобы продолжить"}
        </p>
      ) : null}

      {(mode === "login" && showRegisterLink) || mode === "register" ? (
        <p className="text-center text-sm text-aura-ivory/55">
          {mode === "login" ? (
            <>
              Впервые в Zovus?{" "}
              <Link
                href={registerHref}
                className="font-medium text-aura-champagne underline-offset-2 hover:underline"
              >
                Создать аккаунт
              </Link>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <Link
                href={loginHref}
                className="font-medium text-aura-champagne underline-offset-2 hover:underline"
              >
                Войти
              </Link>
            </>
          )}
        </p>
      ) : null}
    </form>
  );
}
