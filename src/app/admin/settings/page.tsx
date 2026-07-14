"use client";

import { useEffect, useState } from "react";
import AdminShell, { AdminTitle } from "@/components/admin/AdminShell";
import {
  RECAPTCHA_SCOPES,
  RECAPTCHA_SCOPE_LABELS,
  DEFAULT_RECAPTCHA_SCOPES,
  type RecaptchaScopeSettings,
} from "@/lib/recaptcha-scopes";
import { SPREAD_IDS, SPREAD_ADMIN_LABELS } from "@/lib/spread-settings";
import { SPREAD_REGISTRY } from "@/lib/spreads/registry";
import type { SpreadId } from "@/lib/spreads/types";
import { DEFAULT_SPREAD_CATALOG_SETTINGS } from "@/lib/spreads/types";

export default function AdminSettingsPage() {
  const [pricing, setPricing] = useState<Record<string, unknown>>({});
  const [features, setFeatures] = useState<Record<string, unknown>>({});
  const [share, setShare] = useState<Record<string, unknown>>({
    enabled: true,
    expiryDays: 90,
    maxExcerptLength: 50000,
    channels: { telegram: true, vk: true, native: true, copy: true, download: false },
  });
  const [natalChart, setNatalChart] = useState<Record<string, unknown>>({ enabled: false });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setPricing(d.pricing ?? {});
        const f = d.features ?? {};
        setFeatures({
          ...f,
          recaptchaScopes: {
            ...DEFAULT_RECAPTCHA_SCOPES,
            ...(f.recaptchaScopes as RecaptchaScopeSettings | undefined),
          },
          spreadOverrides: {
            ...DEFAULT_SPREAD_CATALOG_SETTINGS.spreadOverrides,
            ...(f.spreadOverrides as Record<string, { enabled?: boolean; costMultiplier?: number }> | undefined),
          },
        });
        setShare(d.share ?? {
          enabled: true,
          expiryDays: 90,
          maxExcerptLength: 50000,
          channels: { telegram: true, vk: true, native: true, copy: true, download: false },
        });
        setNatalChart(d.natalChart ?? { enabled: false });
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
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "share", values: share }),
    });
    await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section: "natalChart", values: natalChart }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const toggle = (key: string) => setFeatures({ ...features, [key]: !features[key] });
  const toggleShare = (key: string) => setShare({ ...share, [key]: !share[key] });
  const toggleNatalChart = (key: string) =>
    setNatalChart({ ...natalChart, [key]: !natalChart[key] });
  const shareChannels = (share.channels ?? {}) as Record<string, boolean>;
  const toggleShareChannel = (key: string) =>
    setShare({
      ...share,
      channels: { ...shareChannels, [key]: !shareChannels[key] },
    });

  const recaptchaScopes = (features.recaptchaScopes ?? DEFAULT_RECAPTCHA_SCOPES) as RecaptchaScopeSettings;
  const recaptchaMaster = Boolean(features.recaptchaEnabled);
  const spreadsMaster = features.spreadsCatalogEnabled !== false;
  const spreadOverrides = (features.spreadOverrides ?? {}) as Record<
    SpreadId,
    { enabled?: boolean; costMultiplier?: number }
  >;

  const toggleSpreadEnabled = (id: SpreadId) => {
    const current = spreadOverrides[id]?.enabled !== false;
    setFeatures({
      ...features,
      spreadOverrides: {
        ...spreadOverrides,
        [id]: { ...spreadOverrides[id], enabled: !current },
      },
    });
  };

  const setSpreadMultiplier = (id: SpreadId, value: number) => {
    setFeatures({
      ...features,
      spreadOverrides: {
        ...spreadOverrides,
        [id]: { ...spreadOverrides[id], costMultiplier: value },
      },
    });
  };

  const toggleRecaptchaScope = (scope: keyof RecaptchaScopeSettings) => {
    setFeatures({
      ...features,
      recaptchaScopes: {
        ...recaptchaScopes,
        [scope]: !recaptchaScopes[scope],
      },
    });
  };

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
                onChange={(e) =>
                  setPricing({ ...pricing, subscriptionPrice: parseInt(e.target.value, 10) })
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
            </div>
          </div>
        </div>

        <div className="glass-panel space-y-4 p-6">
          <h2 className="font-display text-lg text-white">Функции</h2>
          {[
            ["maintenanceMode", "Режим обслуживания"],
            ["registrationEnabled", "Регистрация пользователей"],
            ["expertRegistrationEnabled", "Регистрация эзотериков (мастеров)"],
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

        <div className="glass-panel space-y-4 p-6">
          <h2 className="font-display text-lg text-white">Натальная карта</h2>
          <p className="text-xs text-gray-500">
            Премиальный модуль: западная + ведическая карта, кабинет и контекст для Шри Раджа.
            По умолчанию выключено — безопасный rollout.
          </p>
          <label className="flex cursor-pointer items-center justify-between">
            <span className="text-sm text-gray-300">Включить модуль</span>
            <input
              type="checkbox"
              checked={Boolean(natalChart.enabled)}
              onChange={() => toggleNatalChart("enabled")}
              className="h-4 w-4 accent-aura-purple"
            />
          </label>
        </div>

        <div className="glass-panel space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg text-white">reCAPTCHA</h2>
              <p className="mt-1 text-xs text-gray-500">
                Google reCAPTCHA v3. Требуются ключи в .env.local на сервере.
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <span className="text-sm text-gray-300">Включено</span>
              <input
                type="checkbox"
                checked={recaptchaMaster}
                onChange={() => toggle("recaptchaEnabled")}
                className="h-4 w-4 accent-aura-purple"
              />
            </label>
          </div>

          <div className={`space-y-3 border-t border-white/10 pt-4 ${recaptchaMaster ? "" : "opacity-50"}`}>
            <p className="text-xs text-gray-500">Где проверять (невидимо для пользователя):</p>
            {RECAPTCHA_SCOPES.map((scope) => {
              const isLockoutExempt = scope === "adminLogin";
              return (
                <label
                  key={scope}
                  className={`flex items-center justify-between ${
                    recaptchaMaster && !isLockoutExempt ? "cursor-pointer" : "cursor-not-allowed"
                  }`}
                >
                  <span className="text-sm text-gray-300">
                    {RECAPTCHA_SCOPE_LABELS[scope]}
                    {isLockoutExempt && (
                      <span className="ml-1 text-xs text-gray-500">(всегда выключено — защита от блокировки)</span>
                    )}
                  </span>
                  <input
                    type="checkbox"
                    disabled={!recaptchaMaster || isLockoutExempt}
                    checked={!isLockoutExempt && recaptchaScopes[scope] !== false}
                    onChange={() => toggleRecaptchaScope(scope)}
                    className="h-4 w-4 accent-aura-purple disabled:opacity-40"
                  />
                </label>
              );
            })}
          </div>
        </div>

        <div className="glass-panel space-y-4 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-display text-lg text-white">Каталог раскладов</h2>
              <p className="mt-1 text-xs text-gray-500">
                Включение схем и множители цены относительно базового расклада.
              </p>
            </div>
            <label className="flex shrink-0 cursor-pointer items-center gap-2">
              <span className="text-sm text-gray-300">Каталог</span>
              <input
                type="checkbox"
                checked={spreadsMaster}
                onChange={() => toggle("spreadsCatalogEnabled")}
                className="h-4 w-4 accent-aura-purple"
              />
            </label>
          </div>

          <div className={`space-y-4 border-t border-white/10 pt-4 ${spreadsMaster ? "" : "opacity-50"}`}>
            {SPREAD_IDS.filter((id) => id !== "triplet-love").map((id) => {
              const base = SPREAD_REGISTRY[id];
              const override = spreadOverrides[id];
              const enabled = override?.enabled !== false;
              return (
                <div
                  key={id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 pb-3 last:border-0"
                >
                  <label className={`flex items-center gap-2 ${spreadsMaster ? "cursor-pointer" : "cursor-not-allowed"}`}>
                    <input
                      type="checkbox"
                      disabled={!spreadsMaster || id === "triplet"}
                      checked={enabled}
                      onChange={() => toggleSpreadEnabled(id)}
                      className="h-4 w-4 accent-aura-purple disabled:opacity-40"
                    />
                    <span className="text-sm text-gray-300">{SPREAD_ADMIN_LABELS[id]}</span>
                  </label>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>×</span>
                    <input
                      type="number"
                      step="0.1"
                      min={0.1}
                      max={5}
                      disabled={!spreadsMaster}
                      value={override?.costMultiplier ?? base.costMultiplier}
                      onChange={(e) =>
                        setSpreadMultiplier(id, parseFloat(e.target.value) || base.costMultiplier)
                      }
                      className="w-16 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-white"
                    />
                    <span>(база {base.costMultiplier})</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="glass-panel space-y-4 p-6">
          <h2 className="font-display text-lg text-white">Поделиться</h2>
          <p className="text-xs text-gray-500">
            Глобальная система шаринга раскладов: публичные ссылки, карточки и Open Graph.
          </p>
          <label className="flex cursor-pointer items-center justify-between">
            <span className="text-sm text-gray-300">Шаринг включён</span>
            <input
              type="checkbox"
              checked={share.enabled !== false}
              onChange={() => toggleShare("enabled")}
              className="h-4 w-4 accent-aura-purple"
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Срок жизни ссылки, дней</label>
              <input
                type="number"
                min={1}
                max={365}
                value={Number(share.expiryDays ?? 90)}
                onChange={(e) => setShare({ ...share, expiryDays: parseInt(e.target.value, 10) })}
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">
                Макс. длина текста расклада (хранение)
              </label>
              <input
                type="number"
                min={500}
                max={100000}
                value={Number(share.maxExcerptLength ?? 50000)}
                onChange={(e) =>
                  setShare({ ...share, maxExcerptLength: parseInt(e.target.value, 10) })
                }
                className="w-full rounded-xl border border-white/10 bg-black/30 px-4 py-2.5 text-sm text-white"
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Серверный hard cap — 100 000 символов. Поле используется для совместимости настроек.
              </p>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["telegram", "Telegram"],
                ["vk", "VK"],
                ["native", "Ещё (native share)"],
                ["copy", "Копировать ссылку"],
                ["download", "Скачать PNG"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex cursor-pointer items-center justify-between rounded-xl border border-white/10 px-3 py-2">
                <span className="text-sm text-gray-300">{label}</span>
                <input
                  type="checkbox"
                  checked={shareChannels[key] !== false}
                  onChange={() => toggleShareChannel(key)}
                  className="h-4 w-4 accent-aura-purple"
                />
              </label>
            ))}
          </div>
        </div>

        <button onClick={save} className="btn-neon w-fit px-6 py-2.5 text-sm">
          {saved ? "Сохранено ✓" : "Сохранить"}
        </button>
      </div>
    </AdminShell>
  );
}
