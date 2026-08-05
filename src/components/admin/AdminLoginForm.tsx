"use client";

import { useEffect, useState } from "react";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { fetchPlatformFeatures } from "@/lib/usePlatformFeatures";

export default function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => r.json())
      .then((d) => {
        if (d.authenticated && d.user?.role === "admin") {
          window.location.replace("/admin");
        }
      })
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const features = await fetchPlatformFeatures();
      const body: Record<string, unknown> = {
        email: email.trim(),
        password,
      };
      const captchaErr = await attachRecaptchaToken(body, "adminLogin", features);
      if (captchaErr) {
        setError(captchaErr);
        return;
      }

      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      let data: { error?: string; message?: string } = {};
      try {
        data = await res.json();
      } catch {
        data = {};
      }

      if (!res.ok) {
        if (data.error === "rate_limit") {
          setError(data.message ?? "Слишком много попыток. Подождите и попробуйте снова.");
        } else if (res.status === 401) {
          setError(data.error ?? "Неверный email или пароль");
        } else if (res.status === 503) {
          setError(data.error ?? "База данных недоступна");
        } else if (res.status === 400) {
          setError(data.error ?? "Проверьте email и пароль");
        } else {
          setError(data.error ?? "Ошибка входа");
        }
        return;
      }

      window.location.replace("/admin");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("Сервер не отвечает. Проверьте, что приложение и база данных запущены.");
      } else {
        setError("Сеть недоступна");
      }
    } finally {
      window.clearTimeout(timeout);
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="glass-panel mx-auto max-w-md p-8 text-center text-sm text-gray-500">
        Проверяем сессию…
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="glass-panel mx-auto max-w-md space-y-4 p-8">
      <h1 className="font-display text-center text-2xl font-bold text-white">Zovus Admin</h1>
      <p className="text-center text-xs text-gray-500">Панель управления порталом</p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        autoComplete="username"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
      />
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        autoComplete="current-password"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
      />
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="btn-primary w-full py-3 text-sm disabled:opacity-50">
        {loading ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
