"use client";

import { useEffect, useLayoutEffect, useState } from "react";

const PENDING_TOKEN_KEY = "zovus_pending_email_proof";
const LOGIN_HREF = "/auth/user/login?returnTo=%2Fauth%2Fuser%2Fverify-email";

export default function VerifyEmailPage() {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [required, setRequired] = useState<boolean | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [message, setMessage] = useState("");

  useLayoutEffect(() => {
    const readToken = () => {
      const fromLink = new URLSearchParams(window.location.hash.slice(1)).get("token");
      if (fromLink) sessionStorage.setItem(PENDING_TOKEN_KEY, fromLink);
      // Keep the bearer out of browser history and later analytics scripts.
      if (window.location.hash) window.history.replaceState(null, "", window.location.pathname);
      setToken(sessionStorage.getItem(PENDING_TOKEN_KEY) ?? "");
    };
    readToken();
    window.addEventListener("hashchange", readToken);
    return () => window.removeEventListener("hashchange", readToken);
  }, []);

  useEffect(() => {
    void fetch("/api/auth/user/verify-email", { credentials: "include", cache: "no-store" })
      .then(async (response) => {
        if (response.status === 401) { setNeedsLogin(true); return; }
        if (!response.ok) return;
        const data = await response.json() as { required?: boolean };
        setRequired(data.required === true);
        setNeedsLogin(false);
      })
      .catch(() => undefined);
  }, []);

  async function confirm() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/user/verify-email", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json() as { error?: string };
      if (response.status === 401) setNeedsLogin(true);
      if (!response.ok) throw new Error(data.error);
      sessionStorage.removeItem(PENDING_TOKEN_KEY);
      setToken(""); setRequired(false); setDone(true);
      setMessage("Почта подтверждена. Теперь на этот адрес можно получать письма от Zovus.");
    } catch (error) {
      if (!needsLogin && error instanceof Error && error.message.includes("истекла")) {
        sessionStorage.removeItem(PENDING_TOKEN_KEY);
        setToken("");
      }
      setMessage(error instanceof Error ? error.message : "Ошибка соединения");
    } finally { setBusy(false); }
  }

  async function resend() {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/auth/user/verify-email", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: "{}",
      });
      const data = await response.json() as { error?: string; alreadyVerified?: boolean };
      if (response.status === 401) setNeedsLogin(true);
      if (!response.ok) throw new Error(data.error);
      if (data.alreadyVerified) {
        setRequired(false);
        setMessage("Почта уже подтверждена.");
      } else {
        setMessage("Новое письмо отправлено. Проверьте почту, включая папку «Спам».");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ошибка соединения");
    } finally { setBusy(false); }
  }

  return <main className="mx-auto max-w-lg space-y-6 px-5 py-20 text-white">
    <h1 className="text-2xl font-semibold">Подтверждение почты</h1>
    <p>Подтверждение нужно для писем и напоминаний. Стартовые руны доступны сразу после регистрации.</p>
    {needsLogin ? <p>Чтобы подтвердить адрес, <a className="underline" href={LOGIN_HREF}>войдите в свой аккаунт</a>. Вы вернётесь на эту страницу.</p> : null}
    {!needsLogin && !token && !done && required === true ? <button className="rounded-xl border border-amber-300 px-5 py-3 text-amber-200 disabled:opacity-50" disabled={busy} onClick={() => void resend()}>{busy ? "Отправляем…" : "Отправить новое письмо"}</button> : null}
    {!needsLogin && !done && token ? <button className="rounded-xl bg-amber-300 px-5 py-3 text-black disabled:opacity-50" disabled={busy} onClick={() => void confirm()}>{busy ? "Подтверждаем…" : "Подтвердить почту"}</button> : null}
    {!needsLogin && !token && required === false && !done ? <p>Почта уже подтверждена.</p> : null}
    <p role="status">{message}</p>
    <a className="underline" href="/cabinet">Перейти в кабинет</a>
  </main>;
}
