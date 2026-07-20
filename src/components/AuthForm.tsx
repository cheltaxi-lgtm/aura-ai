"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-policy";
import { isAgeGateConfirmed } from "@/lib/age-gate";
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
import { clearGuestTriplet, loadGuestTriplet, syncGuestSpreadToServer } from "@/lib/guest-triplet";
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
  trackRegistrationAccountCreated,
  trackRegistrationCompleted,
  trackRegistrationError,
  trackRegistrationStarted,
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
    if (isUserRegister && isAgeGateConfirmed()) {
      setAgeConfirmed(true);
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
    }
  }, [isExpert, isUserRegister]);

  useEffect(() => {
    document.body.classList.add("auth-recaptcha-hidden");
    return () => document.body.classList.remove("auth-recaptcha-hidden");
  }, []);

  useEffect(() => {
    if (!featuresLoaded || shouldUseAppShellClient()) return;
    if (recaptcha.masterEnabled && recaptcha.scopes[recaptchaScope]) {
      preloadRecaptchaScript();
    }
  }, [featuresLoaded, recaptcha, recaptchaScope]);

  const loginHref = buildAuthHref(`/auth/${role}/login`, returnTo, isExpert ? "/expert" : "/");
  const registerHref = buildAuthHref(`/auth/${role}/register`, returnTo, isExpert ? "/expert" : "/");

  const isExpertRegister = mode === "register" && role === "expert";
  const requiresLegalConsent = role === "user";
  const canSubmit =
    featuresLoaded &&
    !loading &&
    (!requiresLegalConsent || acceptedTerms) &&
    (!isUserRegister && !isExpertRegister || ageConfirmed);
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
        const guestMasterId = resolveGuestSpreadMasterId(guest?.masterId);
        const hasGuestCards = Boolean(guest?.tarotCards?.length);
        guestRegisterMasterId = guestMasterId;
        guestRegisterHasCards = hasGuestCards;

        if (data.profile) {
          trackRegistrationCompleted(regSource);
          clearShareRegistrationAttribution();
          clearNeedsServerProfile();
          const mergedProfile = {
            ...data.profile,
            tarotCards: guest?.tarotCards ?? data.profile.tarotCards ?? [],
            deckSystem: guest?.deckSystem ?? data.profile.deckSystem,
            teaser: guest?.teaser ?? data.profile.teaser,
            mainQuestion: guest?.question || data.profile.mainQuestion,
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
              tarotCards: guest?.tarotCards ?? [],
              deckSystem: guest?.deckSystem,
              teaser: guest?.teaser,
              mainQuestion: guest?.question,
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
        const guestMasterId = guestRegisterMasterId ?? resolveGuestSpreadMasterId(guest?.masterId);
        destination = resolveRegistrationReturnTo({
          guestSpread: true,
          guestMasterId,
          guestQuestion: guest?.question,
        });
        if (guest?.question?.trim()) {
          persistPendingGuestQuestion(guest.question);
        }
        if (data.profile) {
          try {
            const raw = localStorage.getItem("aura_profile");
            const mergedProfile = raw ? JSON.parse(raw) : null;
            if (mergedProfile) {
              await syncGuestSpreadToServer(mergedProfile, guest);
            }
          } catch {
            /* reading can still load from local profile */
          }
          clearGuestTriplet();
        }
      }

      if (typeof window !== "undefined" && isUserRegister && !data.profile) {
        persistPostAuthReturnTo(
          guestRegisterHasCards
            ? resolveRegistrationReturnTo({
                guestSpread: true,
                guestMasterId:
                  guestRegisterMasterId ??
                  resolveGuestSpreadMasterId(loadGuestTriplet()?.masterId),
                guestQuestion: loadGuestTriplet()?.question,
              })
            : destination
        );
        window.location.assign(onboardingRedirectUrl());
        return;
      }

      if (
        typeof window !== "undefined" &&
        isUserRegister &&
        data.profile &&
        guestRegisterHasCards
      ) {
        window.location.assign(destination);
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
        className={`rounded-xl border bg-white/[0.02] p-4 ${
          oauthError === "consent_required"
            ? "border-amber-400/40 ring-1 ring-amber-400/20"
            : "border-white/8"
        }`}
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
          showMarketing={mode === "register"}
          showDisclaimer
          termsId="legal-terms-consent"
          ageId="legal-age-consent"
        />
        {mode === "register" && (!acceptedTerms || !ageConfirmed) ? (
          <p className="mt-3 text-center text-xs text-amber-200/80">
            Отметьте согласие с условиями и подтвердите возраст 18+.
          </p>
        ) : null}
      </div>
    ) : null;

  if (isUserRegister && !showEmailRegister) {
    return (
      <div className="auth-form glass-panel mx-auto max-w-lg space-y-5 p-8">
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
          onClick={() => setShowEmailRegister(true)}
          className="btn-luxe btn-luxe--md btn-luxe--ghost w-full py-3 text-sm"
        >
          Регистрация по email
        </button>
        <p className="text-center text-xs text-gray-600">
          Уже есть аккаунт?{" "}
          <Link href={loginHref} className="btn-luxe btn-luxe--sm btn-luxe--gold">
            Войти
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="auth-form glass-panel mx-auto max-w-lg space-y-5 p-8">
      {isUserRegister ? (
        <button
          type="button"
          onClick={() => setShowEmailRegister(false)}
          className="text-xs text-gray-500 transition hover:text-aura-champagne"
        >
          ← Войти через VK или Яндекс
        </button>
      ) : null}
      {role === "user" && !isUserRegister ? (
        <>
          <OAuthErrorBanner code={oauthError} returnTo={returnTo} />
          <SocialAuthButtons
            mode={mode as OAuthMode}
            returnTo={returnTo}
            requireConsent={false}
            acceptedTerms={acceptedTerms}
            ageConfirmed={ageConfirmed}
            marketingConsent={marketingConsent}
            disabled={loading}
            consentScrollTargetId="oauth-consent-block"
          />
        </>
      ) : null}
      {isUserRegister ? (
        <p className="text-center text-sm text-gray-400">Создайте аккаунт по email</p>
      ) : null}
      {mode === "register" && !isUserRegister ? (
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
                <label className="mb-1 block text-xs text-gray-500">Адрес страницы</label>
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
      ) : null}

      {mode === "register" && isUserRegister ? (
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
          {legalConsentFields}
        </>
      ) : null}

      <div className={isUserRegister ? "border-t border-white/10 pt-5" : ""}>
        <p className={isUserRegister ? "mb-4 text-center text-xs text-gray-500" : "hidden"}>
          Аккаунт для сохранения истории
        </p>
        <div className="space-y-4">
          <div>
            <label htmlFor={`${role}-${mode}-email`} className="mb-1 block text-xs text-gray-500">Email *</label>
            <input
              id={`${role}-${mode}-email`}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label htmlFor={`${role}-${mode}-password`} className="mb-1 block text-xs text-gray-500">Пароль *</label>
            <input
              id={`${role}-${mode}-password`}
              type="password"
              required
              minLength={mode === "register" ? MIN_PASSWORD_LENGTH : undefined}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "register" ? "new-password" : "current-password"}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
            {mode === "register" ? (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-gray-500">Минимум {MIN_PASSWORD_LENGTH} символов</p>
                {password.length > 0 && passwordStrength ? (
                  <p className={`text-xs ${PASSWORD_STRENGTH_COLORS[passwordStrength]}`}>
                    Надёжность: {PASSWORD_STRENGTH_LABELS[passwordStrength]}
                  </p>
                ) : null}
              </div>
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

      {isUserRegister ? (
        <details className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
          <summary className="cursor-pointer text-sm text-gray-400">
            Дата рождения (необязательно) — пропустить отдельный шаг
          </summary>
          <div className="mt-4 space-y-3">
            <p className="text-xs leading-relaxed text-gray-500">
              Если укажете сейчас, сразу откроем кабинет и начислим стартовые руны. Иначе спросим на
              следующем экране.
            </p>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Дата рождения</label>
              <input
                type="date"
                value={optionalBirthDate}
                onChange={(e) => setOptionalBirthDate(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Пол</label>
              <select
                value={optionalGender}
                onChange={(e) => setOptionalGender(e.target.value as "male" | "female")}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              >
                <option value="female">Женский</option>
                <option value="male">Мужской</option>
              </select>
            </div>
          </div>
        </details>
      ) : null}

      {emailExists ? (
        <p className="text-center text-sm text-amber-300/90">
          Этот email уже зарегистрирован.{" "}
          <Link href={loginHref} className="text-aura-champagne underline underline-offset-2">
            Войти в аккаунт
          </Link>
        </p>
      ) : error ? (
        <div className="space-y-2 text-center">
          <p className="text-sm text-red-400">{error}</p>
          {recaptchaFailed ? (
            <button
              type="button"
              onClick={() => void handleSubmit()}
              className="text-sm text-aura-champagne underline underline-offset-2 hover:text-white"
            >
              Повторить проверку
            </button>
          ) : null}
        </div>
      ) : null}

      {mode === "login" ? legalConsentFields : null}

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
