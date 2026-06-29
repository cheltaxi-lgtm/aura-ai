"use client";

import { useState } from "react";

export default function AdminLoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 20_000);

    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
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
        } else if (res.status === 503) {
          setError(data.error ?? "База данных недоступна");
        } else {
          setError(data.error ?? "Ошибка входа");
        }
        return;
      }

      window.location.assign("/admin");
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
      <button type="submit" disabled={loading} className="btn-neon w-full py-3 text-sm disabled:opacity-50">
        {loading ? "Вход…" : "Войти"}
      </button>
    </form>
  );
}
