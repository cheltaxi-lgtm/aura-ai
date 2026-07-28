"use client";

import { useCallback, useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminBtn } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";
import AdsDisabled from "@/modules/ads/admin/AdsDisabled";

type Settings = {
  flags: {
    enabled: boolean;
    observe?: boolean;
    rulesEnabled: boolean;
    autopilotWrite: boolean;
    rulesMode: string;
  };
  caps: Record<string, number | string>;
  whitelist: string[];
};

export default function AdsSettingsPage() {
  const [data, setData] = useState<Settings | null>(null);
  const [disabled, setDisabled] = useState(false);
  const [caps, setCaps] = useState<Record<string, string>>({});
  const [flags, setFlags] = useState({
    enabled: false,
    observe: true,
    rulesEnabled: false,
    autopilotWrite: false,
  });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [stopOpen, setStopOpen] = useState(false);

  const load = useCallback(() => {
    fetch("/api/ads/admin/settings")
      .then(async (r) => {
        if (r.status === 404) {
          setDisabled(true);
          return;
        }
        if (!r.ok) return;
        const d = (await r.json()) as Settings;
        setData(d);
        setFlags({
          enabled: d.flags.enabled,
          observe: d.flags.observe !== false,
          rulesEnabled: d.flags.rulesEnabled,
          autopilotWrite: d.flags.autopilotWrite,
        });
        const next: Record<string, string> = {};
        for (const [k, v] of Object.entries(d.caps)) {
          if (typeof v === "number") next[k] = String(v);
        }
        setCaps(next);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const body = {
        flags: {
          enabled: flags.enabled,
          observe: flags.observe,
          rulesEnabled: flags.rulesEnabled,
          autopilotWrite: flags.autopilotWrite,
        },
        caps: Object.fromEntries(
          Object.entries(caps).map(([k, v]) => [k, Number(v)])
        ),
      };
      const res = await fetch("/api/ads/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice(d.error ?? "Ошибка сохранения");
      } else {
        setNotice("Сохранено");
        load();
      }
    } finally {
      setBusy(false);
    }
  };

  const stopAll = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/ads/admin/stop", { method: "POST" });
      const d = await res.json().catch(() => ({}));
      setStopOpen(false);
      setNotice(
        res.ok
          ? `Остановлено: ${(d.paused ?? []).length} кампаний`
          : d.error ?? "Ошибка остановки"
      );
    } finally {
      setBusy(false);
    }
  };

  if (disabled) return <AdsDisabled />;

  return (
    <AdminShell>
      <AdminTitle title="Настройки" subtitle="Флаги, капы, whitelist · аварийная остановка" />
      <AdsAdminNav />

      <div className="mb-6 grid gap-4 lg:grid-cols-2">
        <div className="glass-panel space-y-3 p-4">
          <h2 className="text-sm font-semibold text-white">Флаги</h2>
          <p className="text-xs text-gray-500">
            rules mode: <span className="text-aura-gold">{data?.flags.rulesMode}</span> (env
            ADS_RULES_MODE)
          </p>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={flags.observe}
              onChange={(e) => setFlags((f) => ({ ...f, observe: e.target.checked }))}
              className="accent-aura-gold"
            />
            ads.observe — админка + sync источников без beacon
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={flags.enabled}
              onChange={(e) => setFlags((f) => ({ ...f, enabled: e.target.checked }))}
              className="accent-aura-gold"
            />
            ads.enabled — публичный beacon /api/ads/t|e
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={flags.rulesEnabled}
              onChange={(e) => setFlags((f) => ({ ...f, rulesEnabled: e.target.checked }))}
              className="accent-aura-gold"
            />
            ads.rules.enabled
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={flags.autopilotWrite}
              onChange={(e) => setFlags((f) => ({ ...f, autopilotWrite: e.target.checked }))}
              className="accent-aura-gold"
            />
            ads.autopilot.write — запись в Директ (осторожно)
          </label>
        </div>

        <div className="glass-panel space-y-3 p-4">
          <h2 className="text-sm font-semibold text-white">Капы</h2>
          <p className="text-xs text-gray-500">Повышение — только через апрувы</p>
          {Object.keys(caps).map((k) => (
            <label key={k} className="block text-xs text-gray-400">
              {k}
              <input
                type="number"
                value={caps[k]}
                onChange={(e) => setCaps((c) => ({ ...c, [k]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="glass-panel mb-6 p-4">
        <h2 className="mb-2 text-sm font-semibold text-white">Whitelist посадочных</h2>
        <ul className="space-y-1 text-xs text-gray-400">
          {(data?.whitelist ?? []).map((p) => (
            <li key={p} className="text-aura-gold/80">
              {p}
            </li>
          ))}
        </ul>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <AdminBtn onClick={() => void save()} disabled={busy}>
          {busy ? "…" : "Сохранить"}
        </AdminBtn>
        {notice && <p className="self-center text-sm text-aura-emerald">{notice}</p>}
      </div>

      <div className="rounded-xl border border-red-500/40 bg-red-950/30 p-6">
        <h2 className="text-lg font-bold text-red-400">Остановить всю рекламу</h2>
        <p className="mt-1 text-xs text-red-300/70">
          Pause всех кампаний + critical alert. Необратимо без ручного resume.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => setStopOpen(true)}
          className="mt-4 w-full rounded-lg bg-red-600 px-4 py-3 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50 sm:w-auto"
        >
          ОСТАНОВИТЬ ВСЮ РЕКЛАМУ
        </button>
      </div>

      {stopOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="glass-panel max-w-md p-6">
            <h3 className="text-lg font-semibold text-white">Подтвердите остановку</h3>
            <p className="mt-2 text-sm text-gray-400">
              Все активные кампании будут приостановлены. Продолжить?
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <AdminBtn onClick={() => setStopOpen(false)} disabled={busy}>
                Отмена
              </AdminBtn>
              <AdminBtn variant="danger" onClick={() => void stopAll()} disabled={busy}>
                Да, остановить
              </AdminBtn>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
