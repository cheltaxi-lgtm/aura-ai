"use client";

import { FormEvent, Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import SocialAuthButtons, {
  resolveOAuthErrorMessage,
} from "@/components/auth/SocialAuthButtons";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth-policy";
import type { OAuthProvider } from "@/lib/oauth/types";

type MethodsState = {
  email: string | null;
  hasPassword: boolean;
  syntheticEmail: boolean;
  providers: OAuthProvider[];
  canAddEmail: boolean;
};

const PROVIDER_LABEL: Record<OAuthProvider, string> = {
  yandex: "Яндекс",
  vk: "ВКонтакте",
};

function CabinetLoginMethodsInner() {
  const params = useSearchParams();
  const highlight = params.get("loginMethods") === "1";
  const linkedOk = params.get("linked") === "1";
  const oauthErrorCode = params.get("oauthError");
  const oauthError = resolveOAuthErrorMessage(oauthErrorCode);

  const [state, setState] = useState<MethodsState | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState(
    linkedOk ? "Способ входа привязан. Можно заходить с компьютера без Telegram." : ""
  );

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/account/login-methods", {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return;
      const data = (await res.json()) as MethodsState & { ok?: boolean };
      setState({
        email: data.email ?? null,
        hasPassword: Boolean(data.hasPassword),
        syntheticEmail: Boolean(data.syntheticEmail),
        providers: Array.isArray(data.providers) ? data.providers : [],
        canAddEmail: Boolean(data.canAddEmail),
      });
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (highlight) {
      document.getElementById("login-methods")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [highlight]);

  const onEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch("/api/auth/account/login-methods", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
      };
      if (!res.ok || !data.ok) {
        setError(data.message || "Не удалось сохранить email.");
        return;
      }
      setNotice(data.message || "Сохранено.");
      setPassword("");
      await load();
    } catch {
      setError("Не удалось сохранить. Проверьте соединение.");
    } finally {
      setBusy(false);
    }
  };

  const needsSetup =
    !state ||
    state.syntheticEmail ||
    (!state.hasPassword && state.providers.length === 0);

  return (
    <section
      id="login-methods"
      className={`rounded-2xl border px-4 py-5 sm:px-5 ${
        highlight || needsSetup
          ? "border-aura-gold/35 bg-aura-gold/[0.06]"
          : "border-white/10 bg-white/[0.03]"
      }`}
    >
      <h2 className="font-display text-lg text-white">Вход с сайта</h2>
      <p className="mt-1 text-sm leading-6 text-white/55">
        Привяжите Яндекс, VK или почту — потом откроете кабинет на компьютере без
        Telegram. История и руны останутся теми же.
      </p>

      {state ? (
        <ul className="mt-3 space-y-1 text-sm text-white/70">
          {state.providers.map((p) => (
            <li key={p}>✓ {PROVIDER_LABEL[p]} привязан</li>
          ))}
          {state.email && state.hasPassword ? <li>✓ Email: {state.email}</li> : null}
          {!state.providers.length && !(state.email && state.hasPassword) ? (
            <li className="text-amber-200/80">Пока нет способа входа с компьютера</li>
          ) : null}
        </ul>
      ) : null}

      {notice ? (
        <p className="mt-3 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {notice}
        </p>
      ) : null}
      {oauthError ? (
        <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {oauthError}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-red-400/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-4 space-y-3">
        <p className="text-xs font-medium uppercase tracking-wider text-white/40">
          Привязать соцсеть
        </p>
        <SocialAuthButtons
          mode="link"
          returnTo="/cabinet?loginMethods=1"
          requireConsent={false}
          acceptedTerms
          ageConfirmed
          marketingConsent={false}
          showEmailDivider={false}
        />
      </div>

      {state?.canAddEmail ? (
        <form onSubmit={onEmailSubmit} className="mt-5 space-y-3 border-t border-white/8 pt-5">
          <p className="text-xs font-medium uppercase tracking-wider text-white/40">
            Или почта и пароль
          </p>
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="email@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="ui-input w-full"
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            placeholder={`Пароль, минимум ${MIN_PASSWORD_LENGTH} символов`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="ui-input w-full"
          />
          <button type="submit" disabled={busy} className="btn-neon w-full disabled:opacity-60">
            {busy ? "Сохраняем…" : "Сохранить email и пароль"}
          </button>
        </form>
      ) : null}
    </section>
  );
}

export default function CabinetLoginMethods() {
  return (
    <Suspense fallback={null}>
      <CabinetLoginMethodsInner />
    </Suspense>
  );
}
