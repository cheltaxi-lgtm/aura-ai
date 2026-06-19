"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Ошибка входа");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Сеть недоступна");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="glass-panel mx-auto max-w-md space-y-4 p-8">
      <h1 className="font-display text-center text-2xl font-bold text-white">Aura Admin</h1>
      <p className="text-center text-xs text-gray-500">Панель управления порталом</p>
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
      />
      <input
        type="password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Пароль"
        className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
      />
      {error && <p className="text-center text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={loading} className="btn-neon w-full py-3 text-sm disabled:opacity-50">
        {loading ? "..." : "Войти"}
      </button>
    </form>
  );
}
