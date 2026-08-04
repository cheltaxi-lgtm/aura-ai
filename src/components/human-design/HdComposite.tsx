"use client";

import { useMemo, useState } from "react";
import type { HdChart } from "@/lib/human-design";
import { CHANNELS, TYPE_META } from "@/lib/human-design";
import Bodygraph from "./Bodygraph";
import type { HdChartPayload } from "./HdChartView";

interface Props {
  base: HdChartPayload;
  partner: HdChartPayload;
}

/** Composite overlay: base chart + partner's activations, electromagnetic channels. */
export default function HdComposite({ base, partner }: Props) {
  const { mergedChart, electromagnetic, partnerOnlyGates, sharedCount } = useMemo(() => {
    const a = base.chart;
    const b = partner.chart;
    const gatesA = new Set(a.activeGates);
    const gatesB = new Set(b.activeGates);
    const union = new Set([...gatesA, ...gatesB]);

    const definedA = new Set(a.channels.filter((c) => c.defined).map((c) => c.key));
    const definedB = new Set(b.channels.filter((c) => c.defined).map((c) => c.key));

    const mergedChannels = CHANNELS.map((ch) => {
      const key = `${ch.gates[0]}-${ch.gates[1]}`;
      return {
        key,
        gates: [ch.gates[0], ch.gates[1]] as [number, number],
        centers: [ch.centers[0], ch.centers[1]] as HdChart["channels"][number]["centers"],
        defined: union.has(ch.gates[0]) && union.has(ch.gates[1]),
      };
    });

    const electromagnetic = new Set<string>();
    for (const ch of mergedChannels) {
      if (ch.defined && !definedA.has(ch.key) && !definedB.has(ch.key)) {
        electromagnetic.add(ch.key);
      }
    }

    const definedCenters = [
      ...new Set(mergedChannels.filter((c) => c.defined).flatMap((c) => c.centers)),
    ];

    const partnerOnlyGates = new Set([...gatesB].filter((g) => !gatesA.has(g)));
    const sharedCount = [...gatesA].filter((g) => gatesB.has(g)).length;

    const mergedChart: HdChart = {
      ...a,
      activeGates: [...union].sort((x, y) => x - y),
      channels: mergedChannels,
      definedCenters,
    };

    return { mergedChart, electromagnetic, partnerOnlyGates, sharedCount };
  }, [base, partner]);

  const partnerName =
    partner.subjectKind === "other" && partner.subjectName ? partner.subjectName : "Партнёр";

  const [report, setReport] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buyReport = async () => {
    if (busy) return;
    if (
      !window.confirm(
        "Эвелина подготовит разбор совместимости двух карт (списываются руны). Расчётные данные обеих карт будут переданы языковой модели. Продолжить?"
      )
    ) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/human-design/composite-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          baseChartId: base.id,
          partnerChartId: partner.id,
          aiDataUseAcknowledged: true,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        report?: { reportText?: string | null };
        error?: string;
        message?: string;
      };
      if (res.status === 401) {
        setError("Разбор совместимости доступен после входа в аккаунт — карты сохранятся в кабинете.");
        return;
      }
      if (res.status === 402) {
        setError(data.message ?? "Недостаточно рун для разбора совместимости.");
        return;
      }
      if (!res.ok || !data.report?.reportText) {
        setError(data.error ?? "Не удалось получить разбор. Попробуйте позже.");
        return;
      }
      setReport(data.report.reportText);
    } catch {
      setError("Сеть недоступна. Попробуйте позже.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hd-panel space-y-4">
      <div>
        <p className="hd-panel__title">Композит: вы + {partnerName}</p>
        <p className="mt-1 text-xs leading-relaxed text-white/60">
          Фиолетовым подсвечены ворота партнёра и электромагнетические каналы — они
          возникают только вместе. Общих ворот: {sharedCount}. Электромагнетика:{" "}
          {electromagnetic.size > 0
            ? `${electromagnetic.size} канал(ов) — искра притяжения и притирки`
            : "нет — союз мягкий, без резких искр"}
          .
        </p>
        <p className="mt-1 text-[0.6875rem] text-white/40">
          Типы: вы — {TYPE_META[base.chart.type].nameRu}, {partnerName} —{" "}
          {TYPE_META[partner.chart.type].nameRu}
        </p>
      </div>
      <Bodygraph
        chart={mergedChart}
        electromagneticChannels={electromagnetic}
        partnerGates={partnerOnlyGates}
      />

      <div className="hd-print-hidden">
        {!report && (
          <button
            type="button"
            onClick={() => void buyReport()}
            disabled={busy}
            className="hd-bodygraph__export"
          >
            {busy ? "Эвелина готовит разбор…" : "Разбор совместимости от Эвелины"}
          </button>
        )}
        {error && (
          <p className="mt-2 rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-xs text-red-200/90">
            {error}
          </p>
        )}
        {report && (
          <div className="hd-report mt-4">
            {report.split(/^## /m).map((section, i) => {
              if (i === 0 && !section.startsWith("##")) {
                return section.trim() ? <p key={i}>{section.trim()}</p> : null;
              }
              const [title, ...rest] = section.replace(/^## /, "").split("\n");
              return (
                <div key={i}>
                  <h2>{title}</h2>
                  {rest.join("\n").trim().split(/\n{2,}/).map((p, j) => (
                    <p key={j}>{p}</p>
                  ))}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
