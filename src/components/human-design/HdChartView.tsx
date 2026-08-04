"use client";

import { useState } from "react";
import type { HdChart } from "@/lib/human-design";
import {
  AUTHORITY_NAMES_RU,
  CROSS_ANGLE_NAMES_RU,
  CROSS_NAMES_RU,
  DEFINITION_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design";
import Bodygraph from "./Bodygraph";
import HdShareCard from "./HdShareCard";

export interface HdChartPayload {
  id: string;
  fingerprint: string;
  placeName: string;
  birthDate: string;
  birthTime: string | null;
  timeUnknown: boolean;
  subjectKind?: "self" | "other";
  subjectName?: string | null;
  chart: HdChart;
}

function crossNameRu(chart: HdChart): string {
  const names = CROSS_NAMES_RU[chart.cross.gates[0]];
  if (!names) return chart.cross.nameEn;
  const index = chart.cross.angle === "right" ? 0 : chart.cross.angle === "juxtaposition" ? 1 : 2;
  return names[index] ?? chart.cross.nameEn;
}

export default function HdChartView({ payload }: { payload: HdChartPayload }) {
  const { chart } = payload;
  const typeMeta = TYPE_META[chart.type];
  const stability = chart.stability;
  const [copied, setCopied] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);

  const share = async () => {
    const url = `${window.location.origin}/dizayn-cheloveka/karta/${payload.fingerprint}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Моя карта Дизайна Человека", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* user cancelled share sheet */
    }
  };

  return (
    <div className="space-y-5">
      <div className="hd-facts">
        <div className="hd-fact">
          <p className="hd-fact__label">Тип</p>
          <p className="hd-fact__value">{typeMeta.nameRu}</p>
          {stability && !stability.typeStable && (
            <p className="hd-fact__sub">зависит от времени</p>
          )}
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Стратегия</p>
          <p className="hd-fact__value">{typeMeta.strategyRu}</p>
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Авторитет</p>
          <p className="hd-fact__value">{AUTHORITY_NAMES_RU[chart.authority]}</p>
          {stability && !stability.authorityStable && (
            <p className="hd-fact__sub">зависит от времени</p>
          )}
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Профиль</p>
          <p className="hd-fact__value">
            {chart.profile} · {PROFILE_NAMES_RU[chart.profile] ?? ""}
          </p>
          {stability && !stability.profileStable && (
            <p className="hd-fact__sub">зависит от времени</p>
          )}
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Определённость</p>
          <p className="hd-fact__value">{DEFINITION_NAMES_RU[chart.definition] ?? chart.definition}</p>
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Инкарнационный крест</p>
          <p className="hd-fact__value">{crossNameRu(chart)}</p>
          <p className="hd-fact__sub">{CROSS_ANGLE_NAMES_RU[chart.cross.angle]}</p>
        </div>
      </div>

      {payload.timeUnknown && (
        <p className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100/80">
          Время рождения не указано — расчёт выполнен на 12:00.
          {stability?.typeStable && stability?.authorityStable && stability?.profileStable
            ? " Тип, авторитет и профиль стабильны в течение всего дня, результат надёжен."
            : " Некоторые параметры могут меняться в течение дня — они отмечены в карточках выше."}
        </p>
      )}

      <Bodygraph chart={chart} />

      <div className="hd-print-hidden flex flex-wrap justify-center gap-2">
        <button type="button" onClick={() => void share()} className="hd-bodygraph__export">
          {copied ? "Ссылка скопирована" : "Поделиться картой"}
        </button>
        <button
          type="button"
          onClick={() => setShowShareCard((v) => !v)}
          className="hd-bodygraph__export"
        >
          {showShareCard ? "Скрыть карточку" : "Карточка для соцсетей"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="hd-bodygraph__export"
        >
          Печать / PDF
        </button>
      </div>

      {showShareCard && (
        <div className="hd-print-hidden">
          <HdShareCard chart={chart} subjectName={payload.subjectName} />
        </div>
      )}
    </div>
  );
}
