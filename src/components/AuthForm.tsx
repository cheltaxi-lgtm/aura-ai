"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getRecaptchaToken, isRecaptchaConfigured } from "@/lib/useRecaptcha";
import ProfileAstroFields, {
  profileAstroToPayload,
  type ProfileAstroValues,
} from "@/components/ProfileAstroFields";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { clearClientAuthState } from "@/lib/client-logout";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

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
  const { expertRegistrationEnabled } = usePlatformFeatures();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [title, setTitle] = useState("");
  const [astro, setAstro] = useState<ProfileAstroValues>(DEFAULT_ASTRO);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const isExpert = role === "expert";
  const isUserRegister = mode === "register" && role === "user";
  const showRegisterLink =
    mode === "login" && (role !== "expert" || expertRegistrationEnabled);
  const endpoint = `/api/auth/${role}/${mode === "login" ? "login" : "register"}`;

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
      }

      if (isRecaptchaConfigured()) {
        const recaptchaToken = await getRecaptchaToken("signup");
        if (!recaptchaToken) {
          setError("Не удалось пройти проверку reCAPTCHA. Обновите страницу и попробуйте снова.");
          setLoading(false);
          return;
        }
        body.recaptchaToken = recaptchaToken;
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

      {mode === "register" && isRecaptchaConfigured() && (
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

      <button type="submit" disabled={loading} className="btn-neon w-full py-3 text-sm disabled:opacity-50">
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
