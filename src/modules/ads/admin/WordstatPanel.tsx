"use client";

import { useCallback, useEffect, useState } from "react";
import { AdminBtn, AdminTable, StatCard } from "@/components/admin/AdminShell";
import { DualLineChart } from "@/modules/ads/admin/SourcesCharts";
import type {
  WordstatDashboard,
  WordstatMover,
  WordstatPhrase,
} from "@/modules/ads/sources/wordstat";

type Tab = "movers" | "band" | "seeds" | "top";

const CLUSTER_LABELS: Record<string, string> = {
  taro: "Таро",
  runes: "Руны",
  matrix: "Матрица судьбы",
  numerology: "Нумерология",
  relations: "Отношения",
  lenormand: "Ленорман",
};

function fmtNum(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return Math.round(n).toLocaleString("ru-RU");
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(0)}%`;
}

function statusLabel(s: WordstatMover["status"]): string {
  switch (s) {
    case "new":
      return "новая";
    case "risen":
      return "↑ рост";
    case "fallen":
      return "↓ падение";
    case "lost":
      return "пропала";
  }
}

function statusClass(s: WordstatMover["status"]): string {
  switch (s) {
    case "new":
      return "text-sky-300";
    case "risen":
      return "text-emerald-400";
    case "fallen":
      return "text-amber-400";
    case "lost":
      return "text-red-400";
  }
}

function seedsCell(p: WordstatPhrase): string {
  if (!p.seeds?.length) return "—";
  if (p.seeds.length === 1) return p.seeds[0]!;
  return `${p.seeds.length}: ${p.seeds.slice(0, 2).join(", ")}${
    p.seeds.length > 2 ? "…" : ""
  }`;
}

export default function WordstatPanel() {
  const [dash, setDash] = useState<WordstatDashboard | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("movers");

  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/ads/admin/sources/wordstat");
      const json = (await r.json()) as WordstatDashboard & { ok?: boolean; error?: string };
      if (!r.ok || json.ok === false) {
        setNotice(json.error || `Wordstat HTTP ${r.status}`);
        return;
      }
      setDash(json);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Wordstat: сеть/таймаут");
    }
  }, []);

  const refresh = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const r = await fetch("/api/ads/admin/sources/wordstat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh: true }),
      });
      const json = (await r.json()) as WordstatDashboard & {
        ok?: boolean;
        result?: { error?: string; phraseCount?: number; skipped?: boolean };
      };
      if (!r.ok || !json.ok) {
        setNotice(json.result?.error || "Wordstat ошибка");
      } else {
        setNotice(
          `Обновлено: ${fmtNum(json.result?.phraseCount)} уникальных фраз`
        );
        setDash(json);
        setTab("movers");
      }
    } catch {
      setNotice("Wordstat: сеть/таймаут");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const latest = dash?.latest ?? null;
  const staleH = dash?.staleHours;
  const staleBadge =
    staleH == null
      ? null
      : staleH > 48
        ? { text: `устарело ${Math.round(staleH)}ч`, cls: "text-amber-400" }
        : staleH > 24
          ? { text: `${Math.round(staleH)}ч назад`, cls: "text-gray-400" }
          : { text: "свежий", cls: "text-emerald-400" };

  const themePhrases = (dash?.phrases || []).filter((p) => p.inTheme);
  const bandPhrases = themePhrases.filter((p) => p.inDiscoveryBand);

  return (
    <div className="glass-panel mb-6 p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-baseline gap-2">
            <h2 className="text-sm font-semibold text-white">
              Wordstat · спрос по тематике
            </h2>
            {staleBadge ? (
              <span className={`text-[11px] ${staleBadge.cls}`}>
                {staleBadge.text}
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-xl text-[11px] leading-relaxed text-gray-500">
            Частотности Яндекса (Direct v4), Россия. Одна строка = одна фраза
            (дедуп). Частоты не суммируются. Коридор discovery{" "}
            {latest?.discovery.freqMin ?? 100}–
            {latest?.discovery.freqMax ?? 5000}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AdminBtn onClick={() => void refresh()} disabled={busy}>
            {busy ? "Wordstat… (~30с)" : "Обновить Wordstat"}
          </AdminBtn>
          {notice ? (
            <span className={`text-xs ${/ошиб|HTTP|fail|missing|сеть/i.test(notice) ? "text-red-400" : "text-aura-gold"}`}>
              {notice}
            </span>
          ) : null}
        </div>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="В теме"
          value={fmtNum(latest?.inThemeCount)}
          accent="text-aura-gold"
        />
        <StatCard
          label="В коридоре"
          value={fmtNum(latest?.inBandCount)}
          accent="text-aura-emerald"
        />
        <StatCard label="Новые" value={fmtNum(latest?.newCount)} />
        <StatCard
          label="Рост"
          value={fmtNum(latest?.risenCount)}
          accent="text-emerald-400"
        />
        <StatCard
          label="Падение"
          value={fmtNum(latest?.fallenCount)}
          accent="text-amber-400"
        />
        <StatCard
          label="Пропали"
          value={fmtNum(latest?.lostCount)}
          accent="text-red-400"
        />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-gray-500">
        {latest ? (
          <span>
            Прогон{" "}
            {new Date(latest.fetchedAt).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : (
          <span>Нет прогонов — нажмите «Обновить Wordstat»</span>
        )}
        {dash?.previousAt ? (
          <span>
            Сравнение с{" "}
            {new Date(dash.previousAt).toLocaleString("ru-RU", {
              day: "2-digit",
              month: "short",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        ) : latest ? (
          <span>Первый снимок — дифф появится после следующего обновления</span>
        ) : null}
        {latest?.medianShowsTheme != null ? (
          <span>Медиана показов (тема): {fmtNum(latest.medianShowsTheme)}</span>
        ) : null}
        {latest?.maxShows ? (
          <span>Head term: {fmtNum(latest.maxShows)}</span>
        ) : null}
      </div>

      {(dash?.history?.length || 0) > 1 ? (
        <div className="mb-4 rounded-xl border border-white/5 bg-black/20 p-3">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
            История прогонов
          </h3>
          <DualLineChart
            points={(dash?.history || []).map((h) => ({
              date: h.fetchedAt,
              a: h.inThemeCount,
              b: h.inBandCount,
            }))}
          />
        </div>
      ) : null}

      <div className="mb-3 flex flex-wrap gap-1">
        {(
          [
            ["movers", "Изменения"],
            ["band", "Коридор discovery"],
            ["seeds", "По сидам"],
            ["top", "Топ темы"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`rounded-lg px-2.5 py-1 text-[11px] transition ${
              tab === id
                ? "bg-aura-gold/20 text-aura-gold"
                : "text-gray-500 hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "movers" ? (
        (dash?.movers?.length || 0) === 0 ? (
          <p className="text-sm text-gray-600">
            Пока нет значимых изменений (порог Δ ≥ 50 и ≥ 15%). Обновите ещё раз
            позже — появится сравнение с прошлым прогоном.
          </p>
        ) : (
          <AdminTable
            headers={["Фраза", "Было", "Стало", "Δ%", "Статус"]}
            rows={(dash?.movers || []).map((m) => [
              m.phrase,
              fmtNum(m.prevShows),
              fmtNum(m.shows),
              fmtPct(m.deltaPct),
              <span key={m.phraseNorm} className={statusClass(m.status)}>
                {statusLabel(m.status)}
              </span>,
            ])}
          />
        )
      ) : null}

      {tab === "band" ? (
        bandPhrases.length === 0 ? (
          <p className="text-sm text-gray-600">Нет фраз в коридоре discovery</p>
        ) : (
          <AdminTable
            headers={["Фраза", "Показы", "Сиды", "Тип"]}
            rows={bandPhrases.slice(0, 50).map((p) => [
              p.phrase,
              fmtNum(p.shows),
              seedsCell(p),
              p.bucket === "with" ? "с фразой" : "похожие",
            ])}
          />
        )
      ) : null}

      {tab === "seeds" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(dash?.clusters || []).map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-white/8 bg-black/25 px-3 py-3"
            >
              <div className="text-sm font-medium text-white">
                {CLUSTER_LABELS[c.id] || c.id}
              </div>
              <p className="mt-1 text-[11px] text-gray-500">
                {(c.seeds || []).join(" · ")}
              </p>
              <div className="mt-3 flex gap-4 text-xs">
                <span>
                  <span className="text-gray-500">фраз </span>
                  <span className="text-aura-gold">{fmtNum(c.phraseCount)}</span>
                </span>
                <span>
                  <span className="text-gray-500">коридор </span>
                  <span className="text-aura-emerald">
                    {fmtNum(c.inBandCount)}
                  </span>
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {tab === "top" ? (
        themePhrases.length === 0 ? (
          <p className="text-sm text-gray-600">Нет фраз в теме</p>
        ) : (
          <AdminTable
            headers={["Фраза", "Показы", "Сиды", "Коридор"]}
            rows={themePhrases.slice(0, 40).map((p) => [
              p.phrase,
              fmtNum(p.shows),
              seedsCell(p),
              p.inDiscoveryBand ? "да" : "нет",
            ])}
          />
        )
      ) : null}
    </div>
  );
}
