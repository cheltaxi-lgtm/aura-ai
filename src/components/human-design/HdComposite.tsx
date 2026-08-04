"use client";

import { useMemo } from "react";
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
    </div>
  );
}
