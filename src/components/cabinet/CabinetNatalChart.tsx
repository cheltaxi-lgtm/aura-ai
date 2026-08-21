"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Star } from "lucide-react";
import { bigThree, type NatalChartPayload } from "@/lib/natal/presentation";
import { APP_SHELL_ROUTES } from "@/lib/app-shell-nav";
import { shouldUseAppShellClient } from "@/lib/app-shell";
import { useRuneConfig } from "@/lib/useRuneConfig";

type PromoState = {
  kicker: string;
  title: string;
  text: string;
  cta: string;
  hint?: string;
  disabled?: boolean;
};

function buildPromoState(input: {
  enabled: boolean;
  loading: boolean;
  error: string;
  chart: NatalChartPayload | null;
  needsRebuild: boolean;
  readingCostLabel: string;
}): PromoState {
  const { enabled, loading, error, chart, needsRebuild, readingCostLabel } = input;

  if (!enabled) {
    return {
      kicker: "Натальная карта",
      title: "Раздел временно недоступен",
      text: "Астрологическое пространство скоро вернётся. Данные рождения в профиле сохранены.",
      cta: "В кабинет",
      disabled: true,
    };
  }

  if (loading) {
    return {
      kicker: "Натальная карта",
      title: "Загружаем вашу карту…",
      text: "Считаем положения планет и готовим краткий обзор.",
      cta: "Открыть",
      disabled: true,
    };
  }

  if (error) {
    return {
      kicker: "Натальная карта",
      title: "Не удалось загрузить карту",
      text: error,
      cta: "Повторить",
    };
  }

  if (!chart) {
    return {
      kicker: "Натальная карта · расчёт бесплатно",
      title: "Получите новую карту по дате рождения",
      text: `Западное колесо, джйотиш и личные периоды — расчёт по вашим данным, трактовка в кабинете. Полный отчёт — ${readingCostLabel}.`,
      cta: "Получить новую карту",
    };
  }

  if (needsRebuild) {
    return {
      kicker: "Натальная карта · данные изменились",
      title: "Постройте новую карту",
      text: "Дата, время или город в профиле уже другие. Старая карта сохранена — откройте раздел и нажмите «Получить новую карту».",
      cta: "Получить новую карту",
      hint: chart.place?.label,
    };
  }

  const summary = chart.western ? bigThree(chart.western, chart.timeKnown).join(" · ") : "";
  const hasWesternReport = Boolean(chart.interpretations?.western ?? chart.interpretation);
  const hasVedicReport = Boolean(chart.interpretations?.vedic);
  const hasAnyReport = hasWesternReport || hasVedicReport;

  if (!hasAnyReport) {
    return {
      kicker: "Натальная карта · карта рассчитана",
      title: summary || "Ваша карта готова",
      text: `Закажите персональную трактовку: западная карта или джйотиш — ${readingCostLabel} за отчёт. Прогноз на период — отдельно.`,
      cta: "Заказать трактовку",
      hint: chart.place?.label,
    };
  }

  return {
    kicker: "Натальная карта · отчёты сохранены",
    title: summary || "Ваша натальная карта",
    text: "Откройте полное пространство: колесо, даши, персональные периоды, совместимость и новые прогнозы.",
    cta: "Открыть карту",
    hint: [
      hasWesternReport ? "Западный отчёт готов" : null,
      hasVedicReport ? "Джйотиш готов" : null,
      chart.place?.label,
    ]
      .filter(Boolean)
      .join(" · "),
  };
}

export default function CabinetNatalChart() {
  const { cost, formatRunes, ready } = useRuneConfig();
  const [chart, setChart] = useState<NatalChartPayload | null>(null);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadChart = () => {
    setLoading(true);
    setError("");
    void fetch("/api/natal-chart", { credentials: "include" })
      .then(async (response) => {
        const data = await response.json() as {
          enabled?: boolean;
          chart?: NatalChartPayload | null;
          needsRebuild?: boolean;
          error?: string;
        };
        if (!response.ok) throw new Error(data.error || "Не удалось загрузить карту");
        setEnabled(data.enabled !== false);
        setChart(data.chart ?? null);
        setNeedsRebuild(Boolean(data.needsRebuild));
      })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Не удалось загрузить карту");
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadChart();
  }, []);

  const readingCostLabel = useMemo(
    () => (ready ? formatRunes(cost("NATAL_READING")) : "… ᚢ"),
    [cost, formatRunes, ready]
  );

  const promo = useMemo(
    () => buildPromoState({ enabled, loading, error, chart, needsRebuild, readingCostLabel }),
    [chart, enabled, error, loading, needsRebuild, readingCostLabel]
  );

  const openNatal = () => {
    if (promo.disabled) return;
    if (error) {
      loadChart();
      return;
    }
    const target = shouldUseAppShellClient()
      ? APP_SHELL_ROUTES.natalChart
      : "/cabinet/astrology";
    window.location.assign(target);
  };

  return (
    <section className="ritual-cta-banner" aria-labelledby="home-natal-chart-title">
      <div className="ritual-cta-banner__inner">
        <span className="ritual-cta-banner__icon" aria-hidden>
          {loading ? <Loader2 className="h-6 w-6 motion-safe:animate-spin text-amber-200" /> : <Star className="h-6 w-6 text-amber-200" strokeWidth={1.5} />}
        </span>
        <div className="ritual-cta-banner__copy">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
            {promo.kicker}
          </p>
          <h2 id="home-natal-chart-title" className="ritual-cta-banner__title">
            {promo.title}
          </h2>
          <p className="ritual-cta-banner__text">{promo.text}</p>
          {promo.hint ? <p className="mt-1 text-xs text-white/40">{promo.hint}</p> : null}
        </div>
        <button
          type="button"
          onClick={openNatal}
          disabled={promo.disabled}
          className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn disabled:cursor-not-allowed disabled:opacity-50"
        >
          {promo.cta}
        </button>
      </div>
    </section>
  );
}
