"use client";

import { useEffect, useRef, useState } from "react";
import { trackReminderOpt } from "@/lib/seo/product-funnel";

export type DailyReminderStatus = {
  hasEmail: boolean;
  hasContactEmail: boolean;
  masterReminder: boolean;
  dailyCardsReminder: boolean;
};

export default function DailyReminderCard({
  showManage = false,
  onStatusChange,
}: {
  showManage?: boolean;
  onStatusChange?: (status: DailyReminderStatus) => void;
}) {
  const [status, setStatus] = useState<DailyReminderStatus | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [changingEmail, setChangingEmail] = useState(false);
  const onStatusChangeRef = useRef(onStatusChange);
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

  if (!status || (!showManage && status.hasEmail && status.dailyCardsReminder)) return null;

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

  return <aside className="my-4 rounded-2xl border border-amber-300/25 bg-amber-300/[0.06] p-4 text-sm text-white/80" aria-label="Письма о раскладе на сутки">
    <p className="font-semibold text-white">Вернуться к раскладу на сутки</p>
    <p className="mt-1 leading-6">Можем присылать одно письмо о вашем раскладе на сутки. Отключить его можно в кабинете или из письма.</p>
    {status.hasEmail && status.dailyCardsReminder ? <p className="mt-2 text-amber-200">Письмо о раскладе включено.</p> : null}
    {status.hasEmail && !status.dailyCardsReminder ? <button type="button" className="btn-luxe btn-luxe--gold mt-3 min-h-11 px-4" disabled={busy} onClick={() => void enableReminder()}>Включить письмо о раскладе</button> : null}
    {!status.hasEmail || changingEmail ? <div className="mt-3 space-y-3">
      <label className="block">Адрес для уведомлений
        <input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} className="mt-1 block min-h-11 w-full rounded-xl border border-white/15 bg-black/30 px-3 text-white" placeholder="name@example.com" maxLength={254} />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-luxe btn-luxe--gold min-h-11 px-4" disabled={busy || !email.trim()} onClick={() => void requestEmail(status.hasEmail ? status.dailyCardsReminder : true)}>{status.hasEmail ? "Подтвердить новый адрес" : "Подтвердить почту и включить письмо"}</button>
        {!status.hasEmail ? <button type="button" className="min-h-11 px-3 text-amber-200 underline" disabled={busy || !email.trim()} onClick={() => void requestEmail(false)}>Только добавить почту</button> : null}
      </div>
    </div> : null}
    {showManage && status.hasEmail ? <div className="mt-3 flex flex-wrap gap-3 text-xs">
      {status.dailyCardsReminder ? <button type="button" className="min-h-10 text-amber-200 underline" disabled={busy} onClick={() => void disableReminder()}>Отключить письмо</button> : null}
      <button type="button" className="min-h-10 text-amber-200 underline" disabled={busy} onClick={() => setChangingEmail((value) => !value)}>{changingEmail ? "Отменить смену адреса" : "Изменить адрес"}</button>
      {status.hasContactEmail ? <button type="button" className="min-h-10 text-white/65 underline" disabled={busy} onClick={() => void removeEmail()}>Удалить контактный адрес</button> : null}
    </div> : null}
    <p className="mt-2 text-xs text-white/60" role="status">{message}</p>
  </aside>;
}
