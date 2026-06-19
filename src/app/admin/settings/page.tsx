"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";

export default function AdminSettingsPage() {
  const [pricing, setPricing] = useState<Record<string, unknown>>({});
  const [features, setFeatures] = useState<Record<string, unknown>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setPricing(d.pricing ?? {});
        setFeatures(d.features ?? {});
      });
  }, []);

  const save = async () => {
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "pricing", values: pricing }),
    });
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "features", values: features }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggle = (key: string) => setFeatures({ ...features, [key]: !features[key] });

  return (
    <AdminShell>
      <AdminTitle title="Платформа" subtitle="Тарифы, лимиты, feature flags" />
      <div className="grid max-w-3xl gap-6">
        <div className="glass-panel space-y-4 p-6">
          <h2 className="font-display text-lg text-white">Тарифы</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Разбор, ₽</label>
              <input
                type="number"
                value={Number(pricing.singlePrice ?? 199)}
                onChange={(e) => setPricing({ ...pricing, singlePrice: parseInt(e.target.value, 10) })}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Подписка, ₽/мес</label>
              <input
                type="number"
                value={Number(pricing.subscriptionPrice ?? 590)}
                onChange={(e) => setPricing({ ...pricing, subscriptionPrice: parseInt(e.target.value, 10) })}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
            </div>
          </div>
        </div>

        <div className="glass-panel space-y-4 p-6">
          <h2 className="font-display text-lg text-white">Функции</h2>
          {[
            ["maintenanceMode", "Режим обслуживания"],
            ["registrationEnabled", "Регистрация включена"],
            ["recaptchaEnabled", "reCAPTCHA при регистрации"],
            ["demoPayments", "Демо-оплата без ЮKassa"],
          ].map(([key, label]) => (
            <label key={key} className="flex cursor-pointer items-center justify-between">
              <span className="text-sm text-gray-300">{label}</span>
              <input
                type="checkbox"
                checked={Boolean(features[key])}
                onChange={() => toggle(key)}
                className="h-4 w-4 accent-aura-purple"
              />
            </label>
          ))}
          <div>
            <label className="mb-1 block text-xs text-gray-500">Бесплатных вопросов</label>
            <input
              type="number"
              min={0}
              max={10}
              value={Number(features.freeQuestionLimit ?? 2)}
              onChange={(e) =>
                setFeatures({ ...features, freeQuestionLimit: parseInt(e.target.value, 10) })
              }
              className="w-24 rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
            />
          </div>
        </div>

        <button onClick={save} className="btn-neon w-fit px-6 py-2.5 text-sm">
          {saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </div>
    </AdminShell>
  );
}
