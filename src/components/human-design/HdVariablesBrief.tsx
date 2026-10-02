"use client";

import {
  GATE_NAMES_RU,
  hangingGates,
  variableSummary,
  type HdChart,
  type HdPublicChart,
} from "@/lib/human-design";

function isOwnerChart(chart: HdChart | HdPublicChart): chart is HdChart {
  const sun = chart.personality.find((a) => a.body === "sun");
  return Boolean(sun && "color" in sun && typeof sun.color === "number");
}

/** Free Variables / PHS-lite summary from engine color·tone·base (owner charts only). */
export default function HdVariablesBrief({
  chart,
}: {
  chart: HdChart | HdPublicChart;
}) {
  const hang = hangingGates(chart);
  if (!isOwnerChart(chart)) {
    // Public share: color/tone/base stripped — show hanging gates only.
    if (!hang.length) return null;
    return (
      <div className="hd-variables">
        <p className="hd-panel__title">Висящие ворота</p>
        <div className="hd-foundation__centers mt-3">
          <p>
            <span>Без полного канала</span>
            {hang.map((g) => `${g} «${GATE_NAMES_RU[g] ?? ""}»`).join(" · ")}
          </p>
        </div>
      </div>
    );
  }

  const v = variableSummary(chart);
  if (!chart.timeKnown) return (
    <div className="hd-variables">
      <p className="hd-panel__title">Переменные</p>
      <p className="mt-2 text-sm text-white/60">Для четырёх стрелок и среды нужно точное время рождения. По условному времени эти показатели не определяются.</p>
    </div>
  );

  return (
    <div className="hd-variables">
      <p className="hd-panel__title">Четыре стрелки · переменные</p>
      <p className="mt-1.5 text-xs text-white/45">
        Направление по тону Солнца и лунных узлов
      </p>
      <dl className="hd-foundation__grid mt-3">
        {v.variables.map(item => <div key={item.key}>
          <dt>{item.label} · {item.direction === "left" ? "← влево" : "→ вправо"}</dt>
          <dd>
            <strong>
              {item.activation.gate}.{item.activation.line} · цвет {item.activation.color} · тон {item.activation.tone}
            </strong>
            <span>{item.source}</span>
          </dd>
        </div>)}
      </dl>
      <div className="hd-foundation__centers">
        {hang.length > 0 && (
          <p>
            <span>Висящие ворота</span>
            {hang.map((g) => `${g} «${GATE_NAMES_RU[g] ?? ""}»`).join(" · ")}
          </p>
        )}
      </div>
    </div>
  );
}
