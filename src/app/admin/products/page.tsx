"use client";

import { useEffect, useMemo, useState } from "react";
import AdminShell, { AdminTitle, StatCard } from "@/components/admin/AdminShell";
import type {
  ProductActionStats,
  ProductDailyPoint,
  ProductHistoryRow,
  ProductJobRow,
  ProductSectionStats,
} from "@/lib/admin-product-stats";

type Period = "7d" | "30d" | "90d" | "all";

type Payload = {
  sections: ProductSectionStats[];
  actions: ProductActionStats[];
  daily: ProductDailyPoint[];
  history: ProductHistoryRow[];
  jobs: ProductJobRow[];
  totals: {
    spend7d: number;
    spend30d: number;
    spend90d: number;
    spendAll: number;
    runes7d: number;
    runes30d: number;
    runes90d: number;
    runesAll: number;
    users30d: number;
    refunds30d: number;
    jobsPending: number;
  };
};

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function delta(current: number, previous: number): string {
  if (previous <= 0 && current <= 0) return "без изменений";
  if (previous <= 0) return "новый спрос";
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return "как прошлые 30 дней";
  return pct > 0 ? `+${pct}% к прошлым 30 дням` : `${pct}% к прошлым 30 дням`;
}

function spendOf(section: ProductSectionStats, period: Period): number {
  if (period === "7d") return section.spend7d;
  if (period === "90d") return section.spend90d;
  if (period === "all") return section.spendAll;
  return section.spend30d;
}

function runesOf(section: ProductSectionStats, period: Period): number {
  if (period === "7d") return section.runes7d;
  if (period === "90d") return section.runes90d;
  if (period === "all") return section.runesAll;
  return section.runes30d;
}

function actionSpend(row: ProductActionStats, period: Period): number {
  if (period === "7d") return row.spend7d;
  if (period === "90d") return row.spend90d;
  if (period === "all") return row.spendAll;
  return row.spend30d;
}

function actionRunes(row: ProductActionStats, period: Period): number {
  if (period === "7d") return row.runes7d;
  if (period === "90d") return row.runes90d;
  if (period === "all") return row.runesAll;
  return row.runes30d;
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "7d", label: "7 дней" },
  { id: "30d", label: "30 дней" },
  { id: "90d", label: "90 дней" },
  { id: "all", label: "Всё время" },
];

export default function AdminProductsPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [period, setPeriod] = useState<Period>("30d");

  useEffect(() => {
    fetch("/api/admin/product-stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((payload) => setData(payload))
      .catch(() =>
        setData({
          sections: [],
          actions: [],
          daily: [],
          history: [],
          jobs: [],
          totals: {
            spend7d: 0,
            spend30d: 0,
            spend90d: 0,
            spendAll: 0,
            runes7d: 0,
            runes30d: 0,
            runes90d: 0,
            runesAll: 0,
            users30d: 0,
            refunds30d: 0,
            jobsPending: 0,
          },
        })
      );
  }, []);

  const sections = data?.sections ?? [];
  const spend30 = data?.totals.spend30d ?? sections.reduce((sum, s) => sum + s.spend30d, 0);
  const total30 = data?.totals.runes30d ?? sections.reduce((sum, s) => sum + s.runes30d, 0);
  const ranking = useMemo(() => {
    const list = data?.sections ?? [];
    return [...list].sort(
      (a, b) => spendOf(b, period) - spendOf(a, period) || runesOf(b, period) - runesOf(a, period)
    );
  }, [data?.sections, period]);
  const rankMax = ranking[0] ? spendOf(ranking[0], period) : 0;
  const dailyMax = Math.max(1, ...(data?.daily ?? []).map((d) => d.spend));
  const rankedActions = useMemo(
    () =>
      [...(data?.actions ?? [])].sort(
        (a, b) => actionSpend(b, period) - actionSpend(a, period) || actionRunes(b, period) - actionRunes(a, period)
      ),
    [data?.actions, period]
  );

  return (
    <AdminShell>
      <AdminTitle
        title="Спрос на услуги"
        subtitle="Что заказывают чаще, кто платит повторно, как меняется спрос по дням"
      />

      <div className="mb-6 flex flex-wrap gap-2">
        {PERIODS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setPeriod(item.id)}
            className={`min-h-10 rounded-full px-3 text-sm ${
              period === item.id ? "bg-aura-gold/20 text-aura-gold" : "bg-white/5 text-white/60"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Списаний за 30 дней" value={data ? spend30 : "—"} />
        <StatCard label="Рун за 30 дней" value={data ? total30 : "—"} accent="text-aura-gold" />
        <StatCard label="Плативших за 30 дней" value={data ? data.totals.users30d : "—"} />
        <StatCard
          label="Очередь (pending)"
          value={data ? sections.reduce((sum, s) => sum + s.jobsPending, 0) : "—"}
          accent="text-amber-300"
        />
        <StatCard label="Списаний за 7 дней" value={data ? data.totals.spend7d : "—"} />
        <StatCard label="Списаний за 90 дней" value={data ? data.totals.spend90d : "—"} />
        <StatCard label="Списаний всего" value={data ? data.totals.spendAll : "—"} />
        <StatCard
          label="Возвраты за 30 дней"
          value={data ? data.totals.refunds30d : "—"}
          accent="text-rose-300"
        />
      </div>

      <section className="mt-8 glass-panel p-5">
        <h2 className="font-display mb-1 text-lg text-white">Что заказывают чаще</h2>
        <p className="mb-4 text-sm text-white/45">
          Рейтинг разделов по числу оплаченных услуг за выбранный период
        </p>
        {data && ranking.length === 0 ? (
          <p className="text-sm text-white/50">Пока нет списаний по разделам.</p>
        ) : null}
        <ol className="space-y-3">
          {ranking.map((section, index) => {
            const spend = spendOf(section, period);
            const runes = runesOf(section, period);
            const width = rankMax > 0 ? Math.max(4, Math.round((spend / rankMax) * 100)) : 4;
            return (
              <li key={section.id}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
                  <span className="text-white/85">
                    {index + 1}. {section.label}
                  </span>
                  <span className="text-white/55">
                    {fmt(spend)} заказов · {fmt(runes)} ᚢ · {section.users30d} чел. / 30д · доля{" "}
                    {section.shareSpend30d}%
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-white/5">
                  <div className="h-full bg-aura-gold/70" style={{ width: `${width}%` }} />
                </div>
                <p className="mt-1 text-xs text-white/40">
                  Средний чек 30д: {section.avgCheck30d} ᚢ · повторно: {section.repeatUsers30d} · один раз:{" "}
                  {section.onceUsers30d} · {delta(section.spend30d, section.spendPrev30d)}
                </p>
              </li>
            );
          })}
        </ol>
      </section>

      {data?.daily && data.daily.length > 0 ? (
        <section className="mt-8 glass-panel p-5">
          <h2 className="font-display mb-4 text-lg text-white">Списания по дням · 30 дней (Москва)</h2>
          <div className="flex h-36 items-end gap-1">
            {data.daily.map((point) => (
              <div
                key={point.day}
                className="flex-1 rounded-t bg-aura-gold/50"
                style={{ height: `${Math.max(6, Math.round((point.spend / dailyMax) * 100))}%` }}
                title={`${point.day}: ${point.spend} списаний · ${point.runes} ᚢ`}
              />
            ))}
          </div>
          <div className="mt-2 flex justify-between text-xs text-white/35">
            <span>{data.daily[0]?.day}</span>
            <span>{data.daily[data.daily.length - 1]?.day}</span>
          </div>
        </section>
      ) : null}

      <div className="mt-8 space-y-4">
        {ranking.map((section) => (
          <article key={section.id} className="glass-panel p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-lg text-white">{section.label}</h2>
              <p className="text-sm text-white/45">
                30 дней: {section.spend30d} списаний · {section.runes30d} ᚢ · {section.shareRunes30d}% рун
              </p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              <div>
                <dt className="text-white/40">7 дней</dt>
                <dd className="text-white/85">
                  {section.spend7d} · {section.runes7d} ᚢ
                </dd>
              </div>
              <div>
                <dt className="text-white/40">90 дней</dt>
                <dd className="text-white/85">
                  {section.spend90d} · {section.runes90d} ᚢ
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Всего</dt>
                <dd className="text-white/85">
                  {section.spendAll} · {section.runesAll} ᚢ
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Возвраты 30д</dt>
                <dd className="text-white/85">{section.refunds30d}</dd>
              </div>
              <div>
                <dt className="text-white/40">Люди 7 / 30 / всё</dt>
                <dd className="text-white/85">
                  {section.users7d} / {section.users30d} / {section.usersAll}
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Повтор / один раз 30д</dt>
                <dd className="text-white/85">
                  {section.repeatUsers30d} / {section.onceUsers30d}
                </dd>
              </div>
              <div>
                <dt className="text-white/40">Средний чек 30д</dt>
                <dd className="text-white/85">{section.avgCheck30d} ᚢ</dd>
              </div>
              <div>
                <dt className="text-white/40">Очередь / готово / ошибки 30д</dt>
                <dd className="text-white/85">
                  {section.jobsPending} / {section.jobsCompleted30d} / {section.jobsFailed30d}
                </dd>
              </div>
            </dl>
            {section.extras.length > 0 ? (
              <ul className="mt-3 space-y-1 text-sm text-white/55">
                {section.extras.map((extra) => (
                  <li key={extra.label}>
                    {extra.label}: <span className="text-white/80">{extra.value}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>

      {rankedActions.length > 0 ? (
        <div className="mt-8 glass-panel p-5">
          <h2 className="font-display mb-4 text-lg text-white">Списания по действию · 30 дней</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[44rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-white/40">
                <tr>
                  <th className="pb-2 font-medium">Услуга</th>
                  <th className="pb-2 font-medium">7д</th>
                  <th className="pb-2 font-medium">30д</th>
                  <th className="pb-2 font-medium">90д</th>
                  <th className="pb-2 font-medium">Всего</th>
                  <th className="pb-2 font-medium">Люди 30д</th>
                  <th className="pb-2 font-medium">Чек 30д</th>
                  <th className="pb-2 font-medium">Возвраты</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {rankedActions.map((row) => (
                  <tr key={row.action}>
                    <td className="py-2 pr-3 text-white/75">
                      {row.label}
                      <span className="mt-0.5 block text-xs text-white/35">{row.action}</span>
                    </td>
                    <td className="py-2 text-white/70">
                      {row.spend7d} · {row.runes7d} ᚢ
                    </td>
                    <td className="py-2 text-white/85">
                      {row.spend30d} · {row.runes30d} ᚢ
                    </td>
                    <td className="py-2 text-white/70">
                      {row.spend90d} · {row.runes90d} ᚢ
                    </td>
                    <td className="py-2 text-white/70">
                      {row.spendAll} · {row.runesAll} ᚢ
                    </td>
                    <td className="py-2 text-white/70">{row.users30d}</td>
                    <td className="py-2 text-white/70">{row.avgCheck30d} ᚢ</td>
                    <td className="py-2 text-white/55">{row.refunds30d}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {data?.history && data.history.length > 0 ? (
        <div className="mt-8 glass-panel p-5">
          <h2 className="font-display mb-4 text-lg text-white">История кабинета по типу</h2>
          <div className="space-y-2">
            {data.history.map((row) => (
              <div key={row.type} className="flex items-center justify-between text-sm">
                <span className="text-white/60">{row.type}</span>
                <span className="text-white/85">
                  7д {row.n7} · 30д {row.n30} · 90д {row.n90} · всего {row.nall}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {data?.jobs && data.jobs.length > 0 ? (
        <div className="mt-8 glass-panel p-5">
          <h2 className="font-display mb-4 text-lg text-white">Очередь отчётов по виду</h2>
          <div className="space-y-2">
            {data.jobs.map((row) => (
              <div key={row.kind} className="flex items-center justify-between text-sm">
                <span className="text-white/60">{row.kind}</span>
                <span className="text-white/85">
                  в работе {row.pending} · готово 30д {row.completed30d} · ошибки 30д {row.failed30d}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
