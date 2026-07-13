"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { finishUserAuthSuccess } from "@/lib/client-user-auth-success";
import { sanitizeReturnTo } from "@/lib/safe-redirect";
import { isNativeCapacitorPlatform } from "@/lib/app-shell";

type RegistrationPreview = {
  providerLabel: string;
  name: string;
  gender: "male" | "female" | null;
};

async function ensureAuthenticated(handoff: string | null) {
  let meRes = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
  let me = meRes.ok ? await meRes.json() : null;
  if (me?.authenticated) return me;
  if (!handoff) return null;

  const handoffRes = await fetch("/api/auth/oauth/handoff", {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: handoff }),
  });
  if (!handoffRes.ok) return null;
  meRes = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
  me = meRes.ok ? await meRes.json() : null;
  return me?.authenticated ? me : null;
}

export default function OAuthCompletePage() {
  const started = useRef(false);
  const [error, setError] = useState("");
  const [registrationCode, setRegistrationCode] = useState("");
  const [preview, setPreview] = useState<RegistrationPreview | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (started.current || typeof window === "undefined") return;
    started.current = true;
    const params = new URLSearchParams(window.location.search);
    const registration = params.get("registration")?.trim();
    if (registration) {
      setRegistrationCode(registration);
      void fetch(`/api/auth/oauth/register?code=${encodeURIComponent(registration)}`, {
        credentials: "include",
        cache: "no-store",
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("Ссылка регистрации устарела.");
          setPreview((await response.json()) as RegistrationPreview);
        })
        .catch((reason) => setError(reason instanceof Error ? reason.message : "Ссылка устарела."));
      return;
    }

    const returnTo = sanitizeReturnTo(params.get("returnTo"), "/");
    const mode = params.get("mode") === "register" ? "register" : "login";
    const isNewUser = params.get("new") === "1";
    const needsProfile = params.get("needsProfile") === "1";
    const handoff = params.get("handoff");

    void (async () => {
      try {
        const me = await ensureAuthenticated(handoff);
        if (!me) {
          setError("Сессия не создана. Попробуйте войти снова.");
          return;
        }
        window.history.replaceState(null, "", "/auth/oauth/complete");

        let profile: Record<string, unknown> | null = null;
        if (params.get("hasProfile") === "1" && me.user?.profileUserId) {
          const profileRes = await fetch("/api/cabinet", {
            credentials: "include",
            cache: "no-store",
          });
          if (profileRes.ok) profile = (await profileRes.json())?.profile ?? null;
        }
        const oauthGender =
          me.user?.oauthGender === "male" || me.user?.oauthGender === "female"
            ? me.user.oauthGender
            : undefined;
        const destination = await finishUserAuthSuccess({
          mode,
          returnTo,
          isNewUser,
          needsProfile,
          userName: me.user?.name,
          profile,
          oauthGender,
        });
        window.location.replace(destination);
      } catch {
        setError("Не удалось завершить вход. Попробуйте снова.");
      }
    })();
  }, []);

  const completeRegistration = async () => {
    if (!accepted || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/auth/oauth/register", {
        method: "POST",
        credentials: "include",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: registrationCode,
          acceptedTerms: true,
          ageConfirmed: true,
          marketingConsent: marketing,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error("Не удалось завершить регистрацию.");

      if (data.handoff && !isNativeCapacitorPlatform()) {
        const params = new URLSearchParams({
          handoff: data.handoff,
          returnTo: sanitizeReturnTo(data.returnTo, "/"),
          mode: "register",
          new: data.isNewUser ? "1" : "0",
          needsProfile: data.needsProfile ? "1" : "0",
        });
        window.location.replace(`zovus://open/auth/oauth/complete?${params.toString()}`);
        return;
      }

      window.history.replaceState(null, "", "/auth/oauth/complete");
      const destination = await finishUserAuthSuccess({
        mode: "register",
        returnTo: sanitizeReturnTo(data.returnTo, "/"),
        isNewUser: Boolean(data.isNewUser),
        needsProfile: Boolean(data.needsProfile),
        userName: data.name,
        oauthGender:
          data.gender === "male" || data.gender === "female" ? data.gender : undefined,
      });
      window.location.replace(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Не удалось завершить регистрацию.");
      setSubmitting(false);
    }
  };

  if (registrationCode && !error) {
    return (
      <main className="auth-page flex min-h-screen items-center justify-center px-5 py-12">
        <section className="glass-panel w-full max-w-md space-y-5 p-6 text-center">
          <h1 className="text-xl font-semibold text-white">Один шаг до входа</h1>
          <p className="text-sm text-aura-ivory/70">
            {preview
              ? `${preview.name}, подтвердите условия для первого входа через ${preview.providerLabel}.`
              : "Загружаем данные профиля…"}
          </p>
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-black/20 p-4 text-left text-xs leading-relaxed text-gray-300">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(event) => setAccepted(event.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0"
            />
            <span>
              Мне есть 18 лет. Я принимаю{" "}
              <a href="/terms" target="_blank" className="underline">соглашение</a>,{" "}
              <a href="/privacy" target="_blank" className="underline">политику данных</a> и{" "}
              <a href="/disclaimer" target="_blank" className="underline">отказ от ответственности</a>.
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-left text-xs text-gray-500">
            <input
              type="checkbox"
              checked={marketing}
              onChange={(event) => setMarketing(event.target.checked)}
              className="h-4 w-4 shrink-0"
            />
            <span>Получать полезные материалы и предложения</span>
          </label>
          <button
            type="button"
            onClick={() => void completeRegistration()}
            disabled={!accepted || !preview || submitting}
            className="btn-neon w-full py-3 text-sm disabled:opacity-50"
          >
            {submitting ? "Входим…" : "Продолжить"}
          </button>
        </section>
      </main>
    );
  }

  if (error) {
    return (
      <div className="auth-page flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
        <p className="mb-4 text-sm text-red-400">{error}</p>
        <Link href="/auth/user/login" className="text-sm text-aura-champagne underline">
          Вернуться ко входу
        </Link>
      </div>
    );
  }

  return (
    <div className="auth-page flex min-h-screen flex-col items-center justify-center px-6 py-16 text-center">
      <p className="text-sm text-aura-ivory/60">Завершаем вход…</p>
    </div>
  );
}
