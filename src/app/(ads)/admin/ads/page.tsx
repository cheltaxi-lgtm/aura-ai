"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import AdminShell, { AdminTitle, AdminTable, StatCard } from "@/components/admin/AdminShell";
import AdsAdminNav from "@/modules/ads/admin/AdsAdminNav";

type FunnelRow = {
  key: string;
  label: string;
  value: number;
  cr: number | null;
  sampleSmall: boolean;
};

type Overview = {
  mode: string;
  flags?: { enabled: boolean; observe: boolean; rulesMode: string };
  schemaOk?: boolean;
  schemaError?: string | null;
  spent: number;
  visits: number;
  registrations: number;
  targetRegistrations: number;
  progressPct: number;
  funnel: FunnelRow[];
  worstStep: string | null;
  insights: { step: string; value: number; cr: number | null; note: string | null }[];
  health?: {
    balanceRub: number | null;
    metrikaVisits7d: number | null;
    moneyBlocker: string | null;
    sourcesSyncedAt: string | null;
    directOk: boolean | null;
    metrikaOk: boolean | null;
    webmasterOk: boolean | null;
  };
  hardBudget?: {
    spentRub: number;
    hardTotalRub: number;
    remainRub: number;
    pct: number;
    exhaustDate: string | null;
  };
};

function pct(n: number | null): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default function AdsOverviewPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState(0);

  useEffect(() => {
    void Promise.all([
      fetch("/api/ads/admin/overview").then(async (r) => {
        if (r.status === 403) {
          setLoadError("Нужна роль admin");
          return;
        }
        if (!r.ok) {
          setLoadError(`overview HTTP ${r.status}`);
          return;
        }
        setData(await r.json());
      }),
      fetch("/api/ads/admin/approvals").then(async (r) => {
        if (!r.ok) {
          setLoadError(`approvals HTTP ${r.status}`);
          return;
        }
        const d = await r.json();
        setPending(d.pending ?? 0);
      }),
    ]);
  }, []);

  const h = data?.health;

  return (
    <AdminShell>
      <AdminTitle
        title="Продвижение"
        subtitle={
          data?.mode === "discovery"
            ? "Discovery: расход, визиты, регистрации · ROMI скрыт"
            : "Ads Autopilot"
        }
      />
      <AdsAdminNav pendingApprovals={pending} />

      {loadError ? (
        <div className="glass-panel mb-6 p-4 text-sm text-amber-400">{loadError}</div>
      ) : null}
      {data?.schemaOk === false ? (
        <div className="glass-panel mb-6 p-4 text-sm text-amber-400">
          Схема ads не применена. На сервере:{" "}
          <code className="text-gray-300">npm run migrate</code> (миграции 084–088, 139).
          {data.schemaError ? (
            <p className="mt-1 text-xs text-gray-500">{data.schemaError}</p>
          ) : null}
        </div>
      ) : null}

      {data?.hardBudget && (
        <div className="glass-panel mb-6 p-4">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
            <span className="font-semibold text-white">Бюджет (hard)</span>
            <span className={(data.hardBudget.pct >= 90 ? "text-red-400" : "text-aura-gold")}>
              {Math.round(data.hardBudget.spentRub)} / {data.hardBudget.hardTotalRub} ₽ · остаток{" "}
              {Math.round(data.hardBudget.remainRub)} ₽ ({data.hardBudget.pct.toFixed(0)}%)
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div
              className={`h-full transition-all ${
                data.hardBudget.pct >= 90 ? "bg-red-500" : "bg-aura-gold/80"
              }`}
              style={{ width: `${Math.min(100, data.hardBudget.pct)}%` }}
            />
          </div>
          {data.hardBudget.exhaustDate ? (
            <p className="mt-2 text-xs text-gray-500">
              Прогноз исчерпания при текущем темпе: {data.hardBudget.exhaustDate}
            </p>
          ) : null}
        </div>
      )}

      <div className="glass-panel mb-6 grid gap-3 p-4 text-xs text-gray-400 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <p className="text-gray-600">Баланс Директа</p>
          <p className="text-lg text-aura-gold">
            {h?.balanceRub != null ? `${Math.round(h.balanceRub)} ₽` : "н/д"}
          </p>
          {h?.moneyBlocker === "direct_balance_zero" ? (
            <p className="text-amber-400">Пополните счёт — единственный блокер трат</p>
          ) : null}
        </div>
        <div>
          <p className="text-gray-600">Метрика 7д (сайт)</p>
          <p className="text-lg text-white">{h?.metrikaVisits7d ?? "—"}</p>
        </div>
        <div>
          <p className="text-gray-600">Синк источников</p>
          <p className="text-white">
            D:{h?.directOk == null ? "?" : h.directOk ? "✓" : "✗"} · M:
            {h?.metrikaOk == null ? "?" : h.metrikaOk ? "✓" : "✗"} · W:
            {h?.webmasterOk == null ? "?" : h.webmasterOk ? "✓" : "✗"}
          </p>
          <Link href="/admin/ads/sources" className="text-aura-gold hover:underline">
            Открыть источники →
          </Link>
        </div>
        <div>
          <p className="text-gray-600">Флаги</p>
          <p className="text-white">
            enabled:{data?.flags?.enabled ? "on" : "off"} · observe:
            {data?.flags?.observe ? "on" : "off"}
          </p>
          <p className="text-gray-500">rules {data?.flags?.rulesMode ?? "—"}</p>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Расход ads, ₽" value={data ? Math.round(data.spent) : "—"} accent="text-aura-gold" />
        <StatCard label="Клики (ads.click)" value={data?.visits ?? "—"} />
        <StatCard label="Регистрации (ads)" value={data?.registrations ?? "—"} accent="text-aura-emerald" />
        <StatCard
          label={`Прогресс до ${data?.targetRegistrations ?? 100}`}
          value={data ? `${data.progressPct}%` : "—"}
          accent="text-aura-gold"
        />
      </div>

      {data && (
        <div className="glass-panel mb-6 p-4">
          <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
            <span>Цель discovery</span>
            <span className="text-aura-gold">
              {data.registrations} / {data.targetRegistrations}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-aura-gold/80 transition-all"
              style={{ width: `${Math.min(100, data.progressPct)}%` }}
            />
          </div>
        </div>
      )}

      <h2 className="mb-3 text-sm font-semibold text-white">Воронка (атрибуция ads)</h2>
      <AdminTable
        headers={["Шаг", "Кол-во", "CR от предыдущего", ""]}
        rows={(data?.funnel ?? []).map((s) => [
          s.label,
          String(s.value),
          pct(s.cr),
          data?.worstStep === s.key ? (
            <span className="text-amber-400">худший переход</span>
          ) : s.sampleSmall ? (
            <span className="text-gray-600">выборка мала</span>
          ) : (
            ""
          ),
        ])}
      />

      <h2 className="mb-3 mt-8 text-sm font-semibold text-white">Что мы узнали</h2>
      <div className="glass-panel space-y-2 p-4">
        {(data?.insights ?? []).length === 0 ? (
          <p className="text-sm text-gray-600">Пока нет данных воронки</p>
        ) : (
          (data?.insights ?? []).map((ins) => (
            <div key={ins.step} className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
              <span className="text-gray-300">{ins.step}</span>
              <span className="text-gray-500">
                n={ins.value}
                {ins.cr != null ? ` · CR ${pct(ins.cr)}` : ""}
                {ins.note ? (
                  <span className="ml-2 text-amber-500/80">({ins.note})</span>
                ) : null}
              </span>
            </div>
          ))
        )}
      </div>
    </AdminShell>
  );
}
