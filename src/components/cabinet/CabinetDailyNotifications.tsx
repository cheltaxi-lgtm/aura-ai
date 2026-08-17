"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Gift, Mail, Sparkles } from "lucide-react";
import RetentionOptInCard from "@/components/retention/RetentionOptInCard";
import { trackRetentionOptIn } from "@/lib/seo/product-funnel";

type Prefs = {
  dailyEmail: boolean;
  dailyInApp: boolean;
  dailyTelegram: boolean;
  reminderHourMsk: number;
  bonusEmail: boolean;
  marketingEmail: boolean;
  weeklyDigestEmail: boolean;
  reportReadyEmail: boolean;
  reportReadyTelegram: boolean;
};

export default function CabinetDailyNotifications() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    trackRetentionOptIn("retention_optin_settings_opened", {
      surface: "cabinet",
      topic: "personal_reminders",
    });
    void (async () => {
      try {
        const res = await fetch("/api/profile/notifications", { credentials: "include" });
        if (!res.ok) return;
        const data = (await res.json()) as { prefs?: Prefs };
        if (data.prefs) setPrefs(data.prefs);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const save = useCallback(async (patch: Partial<Prefs>) => {
    if (!prefs) return;
    const next = { ...prefs, ...patch };
    setPrefs(next);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/notifications", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (res.ok) {
        const data = (await res.json()) as { prefs?: Prefs };
        if (data.prefs) setPrefs(data.prefs);
      }
    } finally {
      setSaving(false);
    }
  }, [prefs]);

  if (!prefs) return null;

  return (
    <section className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-aura-gold">
        <Bell className="h-4 w-4" />
        <h2 className="text-sm font-medium text-white">Напоминания и письма</h2>
      </div>
      <p className="mt-1 text-xs text-white/45">
        Вы сами выбираете, какие напоминания получать. Настройки можно изменить в кабинете.
      </p>

      <div className="mt-4">
        <RetentionOptInCard surface="cabinet" variant="settings" />
      </div>

      <div className="mt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-white/35">Карты дня</p>
        <p className="mt-0.5 text-xs text-white/40">
          Отдельное согласие на напоминание о картах дня включается на главной.
          Здесь только каналы доставки.
        </p>
        <div className="mt-3 space-y-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.dailyInApp}
              disabled={saving}
              onChange={(e) => void save({ dailyInApp: e.target.checked })}
              className="rounded border-white/20"
            />
            <Bell className="h-4 w-4 text-white/40" />
            Напоминание в приложении
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.dailyEmail}
              disabled={saving}
              onChange={(e) => void save({ dailyEmail: e.target.checked })}
              className="rounded border-white/20"
            />
            <Mail className="h-4 w-4 text-white/40" />
            Письмо о картах дня
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.dailyTelegram ?? true}
              disabled={saving}
              onChange={(e) => void save({ dailyTelegram: e.target.checked })}
              className="rounded border-white/20"
            />
            <Bell className="h-4 w-4 text-white/40" />
            Сообщение в Telegram о картах дня
          </label>
          <label className="block text-xs text-white/45">
            Час напоминания (МСК)
            <select
              value={prefs.reminderHourMsk}
              disabled={saving}
              onChange={(e) => void save({ reminderHourMsk: Number(e.target.value) })}
              className="mt-1 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00 МСК
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-white/35">
          Персональные напоминания Zovus
        </p>
        <p className="mt-0.5 text-xs text-white/40">
          Письма о персональных поводах вернуться. Без отдельного согласия такие письма не уходят.
        </p>
        <div className="mt-3 space-y-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.marketingEmail}
              disabled={saving}
              onChange={(e) => void save({ marketingEmail: e.target.checked })}
              className="rounded border-white/20"
            />
            <Sparkles className="h-4 w-4 text-white/40" />
            Персональные напоминания на почту
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.weeklyDigestEmail === true}
              disabled={saving}
              onChange={(e) => void save({ weeklyDigestEmail: e.target.checked })}
              className="rounded border-white/20"
            />
            <Mail className="h-4 w-4 text-white/40" />
            Еженедельный обзор
          </label>
          <p className="text-xs text-white/35">
            Сохраним предпочтение. Сейчас такие письма не отправляем.
          </p>
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-white/35">Готовность отчётов</p>
        <p className="mt-0.5 text-xs text-white/40">
          Когда платный отчёт будет готов, сообщение всегда появится в колокольчике.
          Дублировать можно на почту и в Telegram.
        </p>
        <div className="mt-3 space-y-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.reportReadyEmail ?? true}
              disabled={saving}
              onChange={(e) => void save({ reportReadyEmail: e.target.checked })}
              className="rounded border-white/20"
            />
            <Mail className="h-4 w-4 text-white/40" />
            Письмо о готовности отчёта
          </label>
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.reportReadyTelegram ?? true}
              disabled={saving}
              onChange={(e) => void save({ reportReadyTelegram: e.target.checked })}
              className="rounded border-white/20"
            />
            <Bell className="h-4 w-4 text-white/40" />
            Сообщение в Telegram о готовности
          </label>
        </div>
      </div>

      <div className="mt-5 border-t border-white/10 pt-4">
        <p className="text-xs font-medium uppercase tracking-wide text-white/35">Бонусы</p>
        <div className="mt-3 space-y-3">
          <label className="flex cursor-pointer items-center gap-3 text-sm text-white/75">
            <input
              type="checkbox"
              checked={prefs.bonusEmail}
              disabled={saving}
              onChange={(e) => void save({ bonusEmail: e.target.checked })}
              className="rounded border-white/20"
            />
            <Gift className="h-4 w-4 text-white/40" />
            Напоминание о ежедневных рунах
          </label>
        </div>
      </div>
    </section>
  );
}
