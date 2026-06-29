"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import ProfileAstroFields, {
  profileAstroToPayload,
  type ProfileAstroValues,
} from "@/components/ProfileAstroFields";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { clearClientAuthState } from "@/lib/client-logout";

interface AuthFormProps {
  mode: "login" | "register";
  role: "user" | "expert";
}

const DEFAULT_ASTRO: ProfileAstroValues = {
  gender: "female",
  birthDate: "",
  birthTime: "",
  birthCity: "",
  lifeFocus: "general",
  mainQuestion: "",
};

export default function AuthForm({ mode, role }: AuthFormProps) {
  const router = useRouter();
  const { expertRegistrationEnabled, recaptcha } = usePlatformFeatures();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [astro, setAstro] = useState<ProfileAstroValues>(DEFAULT_ASTRO);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isExpert = role === "expert";
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
        const profilePayload = profileAstroToPayload(name, astro);
        if (!profilePayload) {
          setError("Укажите дату рождения и имя");
          setLoading(false);
          return;
        }
        Object.assign(body, profilePayload);
        body.sessionId = localStorage.getItem("aura_session_id") ?? undefined;
        body.marketingConsent = marketingConsent;
        body.ageConfirmed = ageConfirmed;
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
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка");
        return;
      }

      if (typeof window !== "undefined") {
        if (mode === "login") {
          clearClientAuthState();
          localStorage.setItem("aura_flow_step", "masters");
        } else if (isUserRegister && !data.sessionLinked) {
          localStorage.removeItem("aura_session_id");
        }
      }

      if (isUserRegister && data.profile) {
        localStorage.setItem(
          "aura_profile",
          JSON.stringify({
            ...data.profile,
            tarotCards: [],
          })
        );
        localStorage.setItem("aura_flow_step", "triplet");
      }

      const returnParams =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      let destination = returnParams
        ? sanitizeReturnTo(
            returnParams.get("returnTo") ?? returnParams.get("next"),
            isExpert ? "/expert" : "/"
          )
        : isExpert
          ? "/expert"
          : "/";

      if (typeof window !== "undefined" && mode === "login" && role === "user") {
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
          {isUserRegister && (
            <ProfileAstroFields
              values={astro}
              onChange={(patch) => setAstro((prev) => ({ ...prev, ...patch }))}
            />
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
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs text-gray-500">Пароль *</label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
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

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-neon w-full py-3 text-sm disabled:opacity-50"
      >
        {loading ? "..." : mode === "login" ? "Войти" : "Создать аккаунт и открыть карты"}
      </button>

      {(mode === "login" && showRegisterLink) || mode === "register" ? (
        <p className="text-center text-xs text-gray-600">
          {mode === "login" ? (
            <>
              Нет аккаунта?{" "}
              <Link href={`/auth/${role}/register`} className="btn-luxe btn-luxe--sm btn-luxe--gold">
                Регистрация
              </Link>
            </>
          ) : (
            <>
              Уже есть аккаунт?{" "}
              <Link href={`/auth/${role}/login`} className="btn-luxe btn-luxe--sm btn-luxe--gold">
                Войти
              </Link>
            </>
          )}
        </p>
      ) : null}
    </form>
  );
}
