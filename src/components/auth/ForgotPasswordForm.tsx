"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { APP_SHELL_HEADER, shouldUseAppShellClient } from "@/lib/app-shell";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { preloadRecaptchaScript } from "@/lib/useRecaptcha";

export default function ForgotPasswordForm() {
  const { expertRegistrationEnabled, recaptcha, featuresLoaded } = usePlatformFeatures();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!featuresLoaded || shouldUseAppShellClient()) return;
    if (recaptcha.masterEnabled && recaptcha.scopes.login) {
      preloadRecaptchaScript();
    }
  }, [featuresLoaded, recaptcha]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const body: Record<string, unknown> = { email: email.trim() };
      const captchaErr = await attachRecaptchaToken(body, "login", {
        expertRegistrationEnabled,
        recaptcha,
      });
      if (captchaErr) {
        setError(captchaErr);
        return;
      }
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (shouldUseAppShellClient()) {
        headers[APP_SHELL_HEADER] = "1";
      }
      const res = await fetch("/api/auth/user/forgot-password", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось отправить письмо");
        return;
      }
      setDone(true);
    } catch {
      setError("Не удалось связаться с сервером. Проверьте подключение и попробуйте ещё раз.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="auth-page mx-auto max-w-md px-6 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-white">Проверьте почту</h1>
        <p className="mt-4 text-sm text-gray-400">
          Если аккаунт с этим email существует, мы отправили ссылку для сброса пароля. Ссылка действует 1 час.
        </p>
        <Link href="/auth/user/login" className="btn-primary mt-8 inline-block px-6 py-2.5 text-sm">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-page mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-center text-2xl font-bold text-white">Сброс пароля</h1>
      <p className="mt-2 text-center text-sm text-gray-400">Укажите email аккаунта — пришлём ссылку для нового пароля.</p>
      <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
        <div>
          <label htmlFor="forgot-email" className="mb-1 block text-xs text-gray-500">Email</label>
          <input
            id="forgot-email"
            autoComplete="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
          />
        </div>
        {error ? <p role="alert" className="text-center text-sm text-red-400">{error}</p> : null}
        <button type="submit" disabled={loading || !featuresLoaded} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
          {loading ? "Отправляем…" : "Отправить ссылку"}
        </button>
      </form>
      <p className="mt-6 text-center text-sm text-gray-500">
        <Link href="/auth/user/login" className="text-aura-champagne hover:underline">
          ← К входу
        </Link>
      </p>
    </div>
  );
}
