"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { trackReminderOpt } from "@/lib/seo/product-funnel";

export default function VerifyContactEmailPage() {
  const started = useRef(false);
  const [state, setState] = useState<"checking" | "ok" | "login" | "invalid">("checking");
  const [dailyReminder, setDailyReminder] = useState(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    window.history.replaceState(window.history.state, "", window.location.pathname);
    if (!token) {
      setState("invalid");
      return;
    }
    void fetch("/api/profile/contact-email", {
      method: "PUT",
      credentials: "include",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    }).then(async (response) => {
      if (response.ok) {
        const data = await response.json() as { dailyCardsReminder?: boolean };
        setDailyReminder(data.dailyCardsReminder === true);
        if (data.dailyCardsReminder === true) trackReminderOpt(true);
      }
      setState(response.ok ? "ok" : response.status === 401 ? "login" : "invalid");
    }).catch(() => setState("invalid"));
  }, []);

  return <main className="flex min-h-screen items-center justify-center bg-[#07060c] px-5 py-12 text-white">
    <section className="glass-panel w-full max-w-md space-y-4 p-6 text-center">
      <h1 className="font-display text-2xl">Подтверждение почты</h1>
      {state === "checking" ? <p>Проверяем ссылку…</p> : null}
      {state === "ok" ? <p>Адрес подтверждён. Теперь письма смогут приходить на него.{dailyReminder ? " Напоминание о раскладе на сутки включено." : " Напоминания можно выбрать в кабинете."}</p> : null}
      {state === "login" ? <p>Войдите в тот же аккаунт, затем откройте ссылку из письма ещё раз.</p> : null}
      {state === "invalid" ? <p>Ссылка недействительна или истекла. Запросите новую в настройках уведомлений.</p> : null}
      <Link className="btn-luxe btn-luxe--gold inline-flex min-h-11 items-center px-5" href="/cabinet">Открыть кабинет</Link>
    </section>
  </main>;
}
