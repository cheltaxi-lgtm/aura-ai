"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-policy";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("Пароли не совпадают");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Минимум ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/user/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Не удалось сменить пароль");
        return;
      }
      router.replace("/auth/user/login?reset=1");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="auth-page mx-auto max-w-md px-6 py-16 text-center">
        <p className="text-sm text-red-400">Ссылка недействительна.</p>
        <Link href="/auth/user/forgot-password" className="btn-primary mt-6 inline-block px-6 py-2.5 text-sm">
          Запросить новую
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-page mx-auto max-w-md px-6 py-16">
      <h1 className="font-display text-center text-2xl font-bold text-white">Новый пароль</h1>
      <form onSubmit={(e) => void submit(e)} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-xs text-gray-500">Новый пароль</label>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-gray-500">Повторите пароль</label>
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
          />
        </div>
        {error ? <p className="text-center text-sm text-red-400">{error}</p> : null}
        <button type="submit" disabled={loading} className="btn-primary w-full py-2.5 text-sm disabled:opacity-50">
          {loading ? "Сохраняем…" : "Сохранить пароль"}
        </button>
      </form>
    </div>
  );
}
