"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createActivationEventKey, trackActivation, type ActivationEventKey } from "@/lib/activation-client";
import { trackReminderOpt } from "@/lib/seo/product-funnel";
import { trackDailyCardsCtaClick } from "@/lib/seo/metrika";

export type DailyReminderStatus = {
  hasEmail: boolean;
  hasContactEmail: boolean;
  hasTelegram: boolean;
  masterReminder: boolean;
  dailyCardsReminder: boolean;
  dailyTelegramReminder: boolean;
};

export default function DailyReminderCard({
  showManage = false,
  compact = false,
  embedded = false,
  onStatusChange,
  source = "post_result",
}: {
  showManage?: boolean;
  compact?: boolean;
  embedded?: boolean;
  onStatusChange?: (status: DailyReminderStatus) => void;
  source?: "post_result" | "personal_home" | "cabinet";
}) {
  const [status, setStatus] = useState<DailyReminderStatus | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const onStatusChangeRef = useRef(onStatusChange);
  const cardRef = useRef<HTMLElement>(null);
  const shownRef = useRef(false);
  const eventKeyRef = useRef<ActivationEventKey | null>(null);
  const eventKey = () => {
    eventKeyRef.current ??= createActivationEventKey() ?? null;
    return eventKeyRef.current ?? undefined;
  };
  onStatusChangeRef.current = onStatusChange;

  const updateStatus = (next: DailyReminderStatus) => {
    setStatus(next);
    onStatusChangeRef.current?.(next);
  };

  useEffect(() => {
    let active = true;
    void fetch("/api/profile/contact-email", { credentials: "include", cache: "no-store" })
      .then(async (res) => res.ok ? await res.json() as DailyReminderStatus : null)
      .then((data) => { if (active && data) {
        setStatus(data);
        onStatusChangeRef.current?.(data);
      } })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (source !== "post_result" || !status || shownRef.current || !cardRef.current) return;
    const card = cardRef.current;
    const shown = () => {
      if (shownRef.current) return;
      shownRef.current = true;
      trackActivation("daily", "offer_shown", eventKey(), source);
    };
    if (typeof IntersectionObserver === "undefined") { shown(); return; }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting && entry.intersectionRatio >= 0.5)) {
        shown();
        observer.disconnect();
      }
    }, { threshold: [0.5] });
    observer.observe(card);
    return () => observer.disconnect();
  }, [source, status]);

  if (!status) return null;

  const enableReminder = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/daily-cards-reminder", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyCardsReminder: true }),
      });
      if (!res.ok) throw new Error();
      updateStatus({ ...status, hasEmail: true, masterReminder: true, dailyCardsReminder: true });
      trackReminderOpt(true);
    } catch {
      setMessage("Не удалось включить напоминание. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  };

  const disableReminder = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/profile/notifications", {
        method: "PATCH", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyEmail: false }),
      });
      if (!res.ok) throw new Error();
      updateStatus({ ...status, dailyCardsReminder: false });
      trackReminderOpt(false);
    } catch {
      setMessage("Не удалось отключить письмо. Попробуйте позже.");
    } finally { setBusy(false); }
  };

  const setTelegramReminder = async (enabled: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/auth/daily-cards-reminder", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyCardsReminder: enabled, channel: "telegram" }),
      });
      if (!res.ok) throw new Error();
      updateStatus({ ...status, masterReminder: enabled ? true : status.masterReminder, dailyTelegramReminder: enabled });
      setMessage(enabled ? "Напоминание в Telegram включено." : "Напоминание в Telegram отключено.");
    } catch {
      setMessage("Не удалось изменить напоминание в Telegram. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  };

  const removeEmail = async () => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/profile/contact-email", {
        method: "DELETE", credentials: "include",
      });
      if (!res.ok) throw new Error();
      updateStatus(await res.json() as DailyReminderStatus);
      setChangingEmail(false);
      setMessage("Контактный адрес удалён.");
    } catch {
      setMessage("Не удалось удалить контактный адрес. Попробуйте позже.");
    } finally { setBusy(false); }
  };

  const requestEmail = async (dailyReminder: boolean) => {
    setBusy(true);
    setMessage("");
    try {
      const res = await fetch("/api/profile/contact-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, dailyReminder }),
      });
      if (!res.ok) throw new Error();
      setMessage("Если адрес доступен, письмо с подтверждением отправлено. Откройте его в этом аккаунте в течение суток.");
    } catch {
      setMessage("Не удалось отправить письмо. Проверьте адрес и попробуйте позже.");
    } finally {
      setBusy(false);
    }
  };

  return <aside ref={cardRef} className={embedded
    ? "mt-3 min-w-0 border-t border-white/10 pt-2 text-sm text-white/80"
    : "my-4 min-w-0 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm text-white/80"} aria-label="Напоминания о раскладе на сутки">
    {!embedded ? <>
    <p className="font-semibold text-white">{source === "post_result" ? "Дальше — отдельный расклад на сутки" : "Ваш бесплатный расклад на сутки"}</p>
    <p className="mt-1 leading-6">{source === "post_result" ? "Это отдельный формат: утро, день и вечер. Он доступен бесплатно раз в сутки, без рун." : "Утро, день и вечер — один расклад бесплатно раз в сутки. Подарочные руны для него не нужны."}</p>
    <Link href="/?daily=1" prefetch={false} className="btn-luxe btn-luxe--gold mt-3 min-h-11 max-w-full min-w-0 whitespace-normal px-4 py-2 text-center leading-snug" style={{transitionProperty:"transform, opacity"}} onClick={(event) => {
      trackDailyCardsCtaClick(source);
      trackActivation("daily", "offer_clicked", eventKey(), source);
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      // Home owns one-shot deep-link state; reload to open daily after a result on the same page.
      event.preventDefault();
      window.location.assign("/?daily=1");
    }}>Открыть расклад на сутки</Link>
    </> : null}
    <details className={embedded ? "min-w-0" : "mt-3 min-w-0"} open={compact || embedded ? undefined : true}>
    <summary className={compact || embedded ? "min-h-11 cursor-pointer py-2 text-amber-200 underline" : "hidden"}>{embedded ? "Настроить письма и Telegram" : "Настроить напоминания"}</summary>
    {status.hasTelegram ? <div className="mt-3 border-t border-white/10 pt-3">
      <p className="leading-6">Одно напоминание в Telegram о новом бесплатном раскладе. Отключить можно здесь или в кабинете.</p>
      {status.dailyTelegramReminder
        ? <button type="button" className="mt-2 min-h-10 text-amber-200 underline" disabled={busy} onClick={() => void setTelegramReminder(false)}>Отключить напоминание в Telegram</button>
        : <button type="button" className="btn-luxe btn-luxe--gold mt-3 min-h-11 max-w-full min-w-0 whitespace-normal px-4 py-2 text-center leading-snug" style={{ transitionProperty: "transform, opacity" }} disabled={busy} onClick={() => void setTelegramReminder(true)}>Напоминать в Telegram</button>}
    </div> : <p className="mt-3 text-xs leading-5 text-white/60">
      Удобнее получать сообщение в Telegram? <Link href="/cabinet#cabinet-telegram-link" className="text-amber-200 underline" onClick={(event) => {
        if (window.location.pathname !== "/cabinet") return;
        const target = document.getElementById("cabinet-telegram-link");
        if (!target) return;
        event.preventDefault();
        window.history.replaceState(window.history.state, "", "/cabinet#cabinet-telegram-link");
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }}>Привяжите его к аккаунту</Link>, затем включите напоминание здесь.
    </p>}
    {showManage || !status.hasEmail || !status.dailyCardsReminder ? <>
    <p className="mt-1 leading-6">Можем присылать одно письмо о вашем раскладе на сутки. Отключить его можно в кабинете или из письма.</p>
    {status.hasEmail && status.dailyCardsReminder ? <p className="mt-2 text-amber-200">Письмо о раскладе включено.</p> : null}
    {status.hasEmail && !status.dailyCardsReminder ? <button type="button" className="btn-luxe btn-luxe--gold mt-3 min-h-11 max-w-full min-w-0 whitespace-normal px-4 py-2 text-center leading-snug" style={{ transitionProperty: "transform, opacity" }} disabled={busy} onClick={() => void enableReminder()}>Включить письмо о раскладе</button> : null}
    {!status.hasEmail || changingEmail ? <div className="mt-3 space-y-3">
      <label className="block">Адрес для уведомлений
        <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white" placeholder="name@example.com" maxLength={254} />
      </label>
      <div className="flex min-w-0 flex-wrap gap-2">
        <button type="button" className="btn-luxe btn-luxe--gold min-h-11 min-w-0 max-w-full w-full whitespace-normal break-words px-4 py-2 text-center leading-snug sm:w-auto" style={{ transitionProperty: "transform, opacity" }} disabled={busy || !email.trim()} onClick={() => void requestEmail(status.hasEmail ? status.dailyCardsReminder : true)}>{status.hasEmail ? "Подтвердить новый адрес" : "Подтвердить почту и включить письмо"}</button>
        {!status.hasEmail ? <button type="button" className="min-h-11 min-w-0 w-full whitespace-normal px-3 text-center text-amber-200 underline sm:w-auto" disabled={busy || !email.trim()} onClick={() => void requestEmail(false)}>Только добавить почту</button> : null}
      </div>
    </div> : null}
    {showManage && status.hasEmail ? <div className="mt-3 flex flex-wrap gap-3 text-xs">
      {status.dailyCardsReminder ? <button type="button" className="min-h-10 text-amber-200 underline" disabled={busy} onClick={() => void disableReminder()}>Отключить письмо</button> : null}
      <button type="button" className="min-h-10 text-amber-200 underline" disabled={busy} onClick={() => setChangingEmail((value) => !value)}>{changingEmail ? "Отменить смену адреса" : "Изменить адрес"}</button>
      {status.hasContactEmail ? <button type="button" className="min-h-10 text-white/65 underline" disabled={busy} onClick={() => void removeEmail()}>Удалить контактный адрес</button> : null}
    </div> : null}
    </> : null}
    {message ? <p className="mt-2 text-xs text-white/60" role="status">{message}</p> : null}
    </details>
  </aside>;
}
