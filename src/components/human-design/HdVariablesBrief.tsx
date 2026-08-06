"use client";

import {
  GATE_NAMES_RU,
  hangingGates,
  variableSummary,
  type HdChart,
  type HdPublicChart,
} from "@/lib/human-design";

/** Free Variables / PHS-lite summary from engine color·tone·base. */
export default function HdVariablesBrief({
  chart,
}: {
  chart: HdChart | HdPublicChart;
}) {
  const v = variableSummary(chart);
  const hang = hangingGates(chart);

  return (
    <div className="hd-variables">
      <p className="hd-panel__title">Переменные · среда</p>
      <p className="mt-1.5 text-xs text-white/45">
        Бесплатно · по color / tone / base Солнца (упрощённо)
      </p>
      <dl className="hd-foundation__grid mt-3">
        <div>
          <dt>Личность · Солнце</dt>
          <dd>
            <strong>
              {v.personalitySun.gate}.{v.personalitySun.line} · цвет {v.personalitySun.color} · тон{" "}
              {v.personalitySun.tone} · база {v.personalitySun.base}
            </strong>
            <span>{GATE_NAMES_RU[v.personalitySun.gate] ?? ""}</span>
          </dd>
        </div>
        <div>
          <dt>Дизайн · Солнце</dt>
          <dd>
            <strong>
              {v.designSun.gate}.{v.designSun.line} · цвет {v.designSun.color} · тон{" "}
              {v.designSun.tone} · база {v.designSun.base}
            </strong>
            <span>{GATE_NAMES_RU[v.designSun.gate] ?? ""}</span>
          </dd>
        </div>
      </dl>
      <div className="hd-foundation__centers">
        <p>
          <span>Познание</span>
          {v.cognitionHint}
        </p>
        <p>
          <span>Среда</span>
          {v.environmentHint}
        </p>
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
