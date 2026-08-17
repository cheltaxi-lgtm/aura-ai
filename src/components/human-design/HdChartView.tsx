"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  HdBodyKey,
  HdCenterKey,
  HdChart,
  HdConnectionRelation,
  HdPublicChart,
} from "@/lib/human-design";
import type { BinaryGender } from "@/lib/russian-name-gender";
import {
  AUTHORITY_NAMES_RU,
  CENTER_NAMES_RU,
  CROSS_ANGLE_NAMES_RU,
  CROSS_NAMES_RU,
  DEFINITION_NAMES_RU,
  PROFILE_NAMES_RU,
  TYPE_META,
} from "@/lib/human-design";
import Bodygraph from "./Bodygraph";
import HdGenerating from "./HdGenerating";
import HdShareCard from "./HdShareCard";
import HdStaticBodygraph from "./HdStaticBodygraph";
import { hdApiErrorMessage } from "./hd-errors";
import { useRuneConfig } from "@/lib/useRuneConfig";

export interface HdChartPayload {
  id: string;
  fingerprint: string;
  /** Present for owner/cabinet; omitted on public share links. */
  placeName?: string | null;
  birthDate?: string | null;
  birthTime?: string | null;
  timeUnknown?: boolean;
  subjectKind?: "self" | "other";
  subjectName?: string | null;
  /** How this other-person chart relates to the owner (pair-report scenario). */
  relationToSelf?: HdConnectionRelation | null;
  /** Binary gender for other-person charts (LLM address). */
  gender?: BinaryGender | null;
  chart: HdChart;
}

/**
 * Public share-link payload: same envelope, but the chart is stripped of
 * birth data, timezone, design moment and raw longitudes (see
 * toPublicHdChartPayload). Optional owner-only fields stay absent.
 */
export type HdPublicChartPayload = Omit<HdChartPayload, "chart"> & {
  chart: HdPublicChart;
};

function crossNameRu(chart: HdChart | HdPublicChart): string {
  const names = CROSS_NAMES_RU[chart.cross.gates[0]];
  if (!names) return chart.cross.nameEn;
  const index = chart.cross.angle === "right" ? 0 : chart.cross.angle === "juxtaposition" ? 1 : 2;
  return names[index] ?? chart.cross.nameEn;
}

export default function HdChartView({
  payload,
}: {
  payload: HdChartPayload | HdPublicChartPayload;
}) {
  const { chart } = payload;
  /** Public share payloads omit birth — no paid center insights there. */
  const isPublicShare = !("birth" in chart);
  const typeMeta = TYPE_META[chart.type];
  const stability = chart.stability;
  const [copied, setCopied] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [transits, setTransits] = useState<Map<number, HdBodyKey> | null>(null);
  const [transitsAt, setTransitsAt] = useState<string | null>(null);
  const [transitsLoading, setTransitsLoading] = useState(false);
  const [transitsError, setTransitsError] = useState<string | null>(null);
  const [insight, setInsight] = useState<{ center: HdCenterKey; text: string } | null>(null);
  const [insightLoading, setInsightLoading] = useState<HdCenterKey | null>(null);
  const [insightStartedAt, setInsightStartedAt] = useState<number | null>(null);
  const [insightError, setInsightError] = useState<string | null>(null);
  const [llmAck, setLlmAck] = useState(false);
  const { cost, formatRunesWithRub, ready } = useRuneConfig();
  const askCost = cost("HD_ASK");
  const askPrice = ready ? formatRunesWithRub(askCost) : `${askCost} ᚢ`;

  // Defense in depth: callers key this component by chart id, but overlays
  // must never survive a chart switch even if a parent forgets the key.
  useEffect(() => {
    setInsight(null);
    setInsightError(null);
    setInsightLoading(null);
    setInsightStartedAt(null);
    setTransits(null);
    setTransitsAt(null);
    setTransitsError(null);
    setLlmAck(false);
    setShowShareCard(false);
    setCopied(false);
  }, [payload.id]);

  const toggleTransits = useCallback(async () => {
    if (transits) {
      setTransits(null);
      setTransitsAt(null);
      setTransitsError(null);
      return;
    }
    setTransitsLoading(true);
    setTransitsError(null);
    try {
      const res = await fetch("/api/human-design/transits");
      if (!res.ok) throw new Error();
      const data = (await res.json()) as {
        at: string;
        activations: { body: HdBodyKey; gate: number }[];
      };
      const map = new Map<number, HdBodyKey>();
      for (const a of data.activations) map.set(a.gate, a.body);
      setTransits(map);
      setTransitsAt(data.at);
    } catch {
      setTransits(null);
      setTransitsAt(null);
      setTransitsError("Не удалось загрузить транзиты. Попробуйте позже.");
    } finally {
      setTransitsLoading(false);
    }
  }, [transits]);

  const askCenterInsight = useCallback(
    async (center: HdCenterKey) => {
      if (insightLoading) return;
      let acknowledged = llmAck;
      if (!acknowledged) {
        acknowledged = window.confirm(
          `Разбор центра от Эвелины · ${askPrice}. Расчётные данные карты будут переданы языковой модели. Продолжить?`
        );
        if (!acknowledged) return;
        setLlmAck(true);
      }
      setInsightLoading(center);
      setInsightStartedAt(Date.now());
      setInsightError(null);
      try {
        const res = await fetch("/api/human-design/center-insight", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chartId: payload.id,
            center,
            aiDataUseAcknowledged: true,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          answer?: string;
          error?: string;
          message?: string;
        };
        if (res.status === 401) {
          setInsightError("Войдите в аккаунт, чтобы получить разбор центра от Эвелины.");
          return;
        }
        if (res.status === 402) {
          setInsightError(data.message ?? "Недостаточно рун для разбора центра.");
          return;
        }
        if (!res.ok || !data.answer) {
          setInsightError(hdApiErrorMessage(data, "Не удалось получить разбор. Попробуйте позже."));
          return;
        }
        setInsight({ center, text: data.answer });
      } catch {
        setInsightError("Сеть недоступна. Попробуйте позже.");
      } finally {
        setInsightLoading(null);
        setInsightStartedAt(null);
      }
    },
    [askPrice, insightLoading, llmAck, payload.id]
  );

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

  const profileLabel = PROFILE_NAMES_RU[chart.profile] ?? "";
  const definitionLabel = DEFINITION_NAMES_RU[chart.definition] ?? chart.definition;
  const crossLabel = crossNameRu(chart);

  return (
    <div className="space-y-5">
      {/* Compact identity — not six lookalike cards stacking the viewport */}
      <div className="hd-summary">
        <p className="hd-summary__title">
          {typeMeta.nameRu}
          {stability && !stability.typeStable ? (
            <span className="hd-summary__flag"> · время</span>
          ) : null}
        </p>
        <p className="hd-summary__line">
          {chart.profile}
          {profileLabel ? ` · ${profileLabel}` : ""}
          {" · "}
          {AUTHORITY_NAMES_RU[chart.authority]}
          {stability && !stability.authorityStable ? (
            <span className="hd-summary__flag"> · время</span>
          ) : null}
        </p>
        <p className="hd-summary__line hd-summary__line--muted">
          {typeMeta.strategyRu}
          {" · "}
          {definitionLabel}
          {" · "}
          {crossLabel}
          {" · "}
          {CROSS_ANGLE_NAMES_RU[chart.cross.angle]}
        </p>
      </div>

      {payload.timeUnknown && (
        <p className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs leading-relaxed text-amber-100/80">
          Время рождения не указано — расчёт выполнен на 12:00.
          {stability?.typeStable && stability?.authorityStable && stability?.profileStable
            ? " Тип, авторитет и профиль стабильны в течение всего дня, результат надёжен."
            : " Некоторые параметры могут меняться в течение дня — они отмечены словом «время» выше."}
        </p>
      )}

      <div className="print:hidden">
        <Bodygraph
          chart={chart}
          transits={transits}
          onCenterInsight={
            isPublicShare ? undefined : (center) => void askCenterInsight(center)
          }
          subjectName={payload.subjectName}
        />
      </div>

      {/* Print gets a light static bodygraph — the dark interactive stage
          loses its background on paper and pale channels turn invisible. */}
      <div className="hidden print:block">
        <div className="mx-auto max-w-md">
          <HdStaticBodygraph
            chart={chart}
            theme="light"
            idPrefix={`hd-print-${payload.id}`}
            className="w-full"
          />
        </div>
      </div>

      {/* Print still gets the classic fact grid; hidden on screen */}
      <div className="hd-facts hidden print:grid">
        <div className="hd-fact">
          <p className="hd-fact__label">Тип</p>
          <p className="hd-fact__value">{typeMeta.nameRu}</p>
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Стратегия</p>
          <p className="hd-fact__value">{typeMeta.strategyRu}</p>
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Авторитет</p>
          <p className="hd-fact__value">{AUTHORITY_NAMES_RU[chart.authority]}</p>
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Профиль</p>
          <p className="hd-fact__value">
            {chart.profile} · {profileLabel}
          </p>
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Определённость</p>
          <p className="hd-fact__value">{definitionLabel}</p>
        </div>
        <div className="hd-fact">
          <p className="hd-fact__label">Инкарнационный крест</p>
          <p className="hd-fact__value">{crossLabel}</p>
          <p className="hd-fact__sub">{CROSS_ANGLE_NAMES_RU[chart.cross.angle]}</p>
        </div>
      </div>

      <div className="hd-print-hidden flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => void toggleTransits()}
          disabled={transitsLoading}
          className="hd-bodygraph__export"
        >
          {transitsLoading
            ? "Считаю небо…"
            : transits
              ? "Скрыть транзиты"
              : "Транзиты"}
        </button>
        <button type="button" onClick={() => void share()} className="hd-bodygraph__export">
          {copied ? "Ссылка скопирована" : "Поделиться"}
        </button>
        <button
          type="button"
          onClick={() => setShowShareCard((v) => !v)}
          className="hd-bodygraph__export"
        >
          {showShareCard ? "Скрыть карточку" : "Для соцсетей"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="hd-bodygraph__export"
          title="Открыть диалог печати браузера (можно сохранить как PDF)"
        >
          Печать / PDF
        </button>
      </div>

      {transitsError && (
        <p className="hd-print-hidden text-center text-[0.6875rem] text-red-200/90" role="alert">
          {transitsError}
        </p>
      )}

      {transits && transitsAt && (
        <p className="hd-print-hidden text-center text-[0.6875rem] text-amber-100/70">
          Кольца на воротах — активации текущего неба (
          {new Date(transitsAt).toLocaleString("ru-RU", {
            day: "numeric",
            month: "long",
            hour: "2-digit",
            minute: "2-digit",
          })}
          ). Нажмите или коснитесь ворот, чтобы увидеть планету-транзит.
        </p>
      )}

      {insightLoading && (
        <div className="hd-print-hidden hd-panel">
          <HdGenerating
            kind="center"
            compact
            title={`Эвелина разбирает центр «${CENTER_NAMES_RU[insightLoading]}»`}
            startedAt={insightStartedAt ?? undefined}
          />
        </div>
      )}

      {insightError && (
        <p className="hd-print-hidden rounded-2xl border border-red-500/25 bg-red-500/5 px-4 py-3 text-center text-xs text-red-200/90">
          {insightError}
        </p>
      )}

      {insight && (
        <div className="hd-print-hidden hd-panel">
          <p className="hd-panel__title">
            Эвелина о центре «{CENTER_NAMES_RU[insight.center]}»
          </p>
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/85">
            {insight.text}
          </p>
          <button
            type="button"
            onClick={() => setInsight(null)}
            className="hd-bodygraph__export mt-4"
          >
            Закрыть
          </button>
        </div>
      )}

      {showShareCard && (
        <div className="hd-print-hidden">
          <HdShareCard chart={chart} subjectName={payload.subjectName} />
        </div>
      )}
    </div>
  );
}
