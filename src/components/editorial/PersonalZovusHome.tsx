"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMatrixOwnership } from "@/hooks/useMatrixOwnership";
import type { DailyCardsUiState } from "@/lib/daily-cards-ui";
import { EDITORIAL_DAILY_CARDS } from "@/lib/editorial-landing-content";
import {
  buildPersonalContinueItems,
  PERSONAL_ZOVUS_EXPLORE,
  type PersonalContinueItem,
} from "@/lib/personal-zovus-home";
import {
  trackDailyCardsCtaClick,
  trackDailyCardsOfferView,
  trackDailyCardsReturnView,
} from "@/lib/seo/metrika";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

type PersonalZovusHomeProps = {
  userName?: string | null;
  dailyCardsState: DailyCardsUiState;
  dailyCooldownHint?: string | null;
  onOpenDailyCards: () => void;
  onViewTodayDailyCards: () => void;
  onPickRegularSpread: () => void;
  /** Visible Tarot recap only (home-recap not hidden). */
  tarotContinueMasterName?: string | null;
  onContinueTarot?: () => void;
  onOpenOwnedMatrix?: () => void;
};

export default function PersonalZovusHome({
  userName,
  dailyCardsState,
  dailyCooldownHint,
  onOpenDailyCards,
  onViewTodayDailyCards,
  onPickRegularSpread,
  tarotContinueMasterName,
  onContinueTarot,
  onOpenOwnedMatrix,
}: PersonalZovusHomeProps) {
  const greetingName = userName?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "";
  const { owned: matrixOwned, loading: matrixLoading } = useMatrixOwnership({ enabled: true });
  const { humanDesignEnabled } = usePlatformFeatures();
  const [natalChartReady, setNatalChartReady] = useState(false);
  const [hdChartId, setHdChartId] = useState<string | null>(null);
  const [continueReady, setContinueReady] = useState(false);
  const viewed = useRef(false);

  useEffect(() => {
    if (viewed.current) return;
    if (!dailyCardsState || dailyCardsState === "loading") return;
    viewed.current = true;
    if (dailyCardsState === "available") trackDailyCardsOfferView("personal_zovus");
    else trackDailyCardsReturnView("personal_zovus");
  }, [dailyCardsState]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [natalRes, hdRes] = await Promise.all([
          fetch("/api/natal-chart", { credentials: "include", cache: "no-store" }),
          humanDesignEnabled
            ? fetch("/api/human-design/mine", { credentials: "include", cache: "no-store" })
            : Promise.resolve(null),
        ]);

        if (!cancelled && natalRes.ok) {
          const natal = (await natalRes.json()) as {
            enabled?: boolean;
            chart?: { id?: string } | null;
          };
          setNatalChartReady(Boolean(natal.enabled !== false && natal.chart));
        }

        if (!cancelled && hdRes && hdRes.ok) {
          const hd = (await hdRes.json()) as {
            enabled?: boolean;
            charts?: Array<{ id?: string; subjectKind?: string; updatedAt?: string; createdAt?: string }>;
          };
          if (hd.enabled !== false && Array.isArray(hd.charts) && hd.charts.length) {
            const self =
              hd.charts.find((c) => c.subjectKind === "self" || !c.subjectKind) ?? hd.charts[0];
            setHdChartId(typeof self?.id === "string" && self.id.trim() ? self.id.trim() : null);
          } else {
            setHdChartId(null);
          }
        }
      } catch {
        /* keep false — no broken continue CTA */
      } finally {
        if (!cancelled) setContinueReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [humanDesignEnabled]);

  const continueItems = useMemo(() => {
    if (matrixLoading || !continueReady) {
      // Tarot can show immediately; hold product continues until ownership loads.
      return buildPersonalContinueItems({
        tarotMasterName: tarotContinueMasterName,
      });
    }
    return buildPersonalContinueItems({
      tarotMasterName: tarotContinueMasterName,
      matrixOwned,
      natalChartReady,
      hdChartId: humanDesignEnabled ? hdChartId : null,
    });
  }, [
    continueReady,
    hdChartId,
    humanDesignEnabled,
    matrixLoading,
    matrixOwned,
    natalChartReady,
    tarotContinueMasterName,
  ]);

  const dailyTitle =
    dailyCardsState === "loading"
      ? EDITORIAL_DAILY_CARDS.authLoadingLabel
      : dailyCardsState === "available"
        ? EDITORIAL_DAILY_CARDS.authAvailableTitle
        : dailyCardsState === "opened"
          ? EDITORIAL_DAILY_CARDS.authOpenedTitle
          : EDITORIAL_DAILY_CARDS.authCooldownTitle;

  const dailyHint =
    dailyCardsState === "loading"
      ? "Готовим карты дня…"
      : dailyCardsState === "available"
        ? EDITORIAL_DAILY_CARDS.authAvailableSubtitle
        : dailyCardsState === "opened"
          ? EDITORIAL_DAILY_CARDS.authOpenedSubtitle
          : dailyCooldownHint?.trim() || EDITORIAL_DAILY_CARDS.authCooldownSubtitle;

  const explore = PERSONAL_ZOVUS_EXPLORE.filter(
    (e) => e.id !== "hd" || humanDesignEnabled
  );

  const handleContinue = (item: PersonalContinueItem) => {
    if (item.kind === "tarot") {
      onContinueTarot?.();
      return;
    }
    if (item.kind === "matrix") {
      if (onOpenOwnedMatrix) {
        onOpenOwnedMatrix();
        return;
      }
      if (item.href) window.location.assign(item.href);
      return;
    }
    if (item.href) window.location.assign(item.href);
  };

  return (
    <section className="personal-zovus" aria-labelledby="personal-zovus-title">
      <header className="personal-zovus__header">
        <p className="personal-zovus__eyebrow">Personal Zovus</p>
        <h1 id="personal-zovus-title" className="personal-zovus__title">
          {greetingName ? (
            <>
              С возвращением, <span className="personal-zovus__name">{greetingName}</span>
            </>
          ) : (
            "С возвращением"
          )}
        </h1>
      </header>

      <div className="personal-zovus__block" aria-labelledby="personal-zovus-today">
        <h2 id="personal-zovus-today" className="personal-zovus__kicker">
          Сегодня
        </h2>
        <div className="personal-zovus__panel">
          <p className="personal-zovus__panel-title">{dailyTitle}</p>
          <p className="personal-zovus__panel-text">{dailyHint}</p>
          {dailyCardsState === "available" ? (
            <button
              type="button"
              className="personal-zovus__cta"
              onClick={() => {
                trackDailyCardsCtaClick("personal_zovus_available");
                onOpenDailyCards();
              }}
            >
              {EDITORIAL_DAILY_CARDS.authAvailableCta}
            </button>
          ) : null}
          {dailyCardsState === "opened" ? (
            <button
              type="button"
              className="personal-zovus__cta"
              onClick={() => {
                trackDailyCardsCtaClick("personal_zovus_opened");
                onViewTodayDailyCards();
              }}
            >
              {EDITORIAL_DAILY_CARDS.authOpenedCta}
            </button>
          ) : null}
          {dailyCardsState === "cooldown" ? (
            <button
              type="button"
              className="personal-zovus__cta personal-zovus__cta--ghost"
              onClick={() => {
                trackDailyCardsCtaClick("personal_zovus_cooldown");
                onPickRegularSpread();
              }}
            >
              {EDITORIAL_DAILY_CARDS.authCooldownCta}
            </button>
          ) : null}
        </div>
      </div>

      {continueItems.length > 0 ? (
        <div className="personal-zovus__block" aria-labelledby="personal-zovus-continue">
          <h2 id="personal-zovus-continue" className="personal-zovus__kicker">
            Продолжить
          </h2>
          <ul className="personal-zovus__list">
            {continueItems.map((item) => (
              <li key={item.kind}>
                <button
                  type="button"
                  className="personal-zovus__row"
                  onClick={() => handleContinue(item)}
                >
                  <span className="personal-zovus__row-title">{item.title}</span>
                  <span className="personal-zovus__row-text">{item.subtitle}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="personal-zovus__block" aria-labelledby="personal-zovus-explore">
        <h2 id="personal-zovus-explore" className="personal-zovus__kicker">
          Исследовать
        </h2>
        <ul className="personal-zovus__explore">
          {explore.map((entry) => {
            if (entry.kind === "action") {
              return (
                <li key={entry.id}>
                  <button
                    type="button"
                    className="personal-zovus__chip"
                    onClick={onPickRegularSpread}
                  >
                    {entry.title}
                  </button>
                </li>
              );
            }
            return (
              <li key={entry.id}>
                <Link href={entry.href!} className="personal-zovus__chip">
                  {entry.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
