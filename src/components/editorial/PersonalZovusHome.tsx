"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import DailyCardsReminderToggle from "@/components/editorial/DailyCardsReminderToggle";
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
import { resolveAuthRetentionState } from "@/lib/auth-retention";
import {
  trackPersonalZovusEvent,
  trackRetentionReturn,
  type ProductFunnelProduct,
} from "@/lib/seo/product-funnel";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

const RETENTION_SESSION_KEY = "zovus_retention_return_emitted";

function continueKindToProduct(
  kind: PersonalContinueItem["kind"]
): ProductFunnelProduct {
  if (kind === "hd") return "human_design";
  return kind;
}

function exploreIdToProduct(
  id: (typeof PERSONAL_ZOVUS_EXPLORE)[number]["id"]
): ProductFunnelProduct {
  if (id === "hd") return "human_design";
  if (id === "matrix_pair") return "matrix_compatibility";
  return id;
}

type PersonalZovusHomeProps = {
  userName?: string | null;
  /** Server-authoritative account createdAt ISO from /api/auth/me. */
  accountCreatedAt?: string | null;
  dailyCardsState: DailyCardsUiState;
  dailyCooldownHint?: string | null;
  onOpenDailyCards: () => void;
  onViewTodayDailyCards: () => void;
  onPickRegularSpread: () => void;
  /** Visible Tarot recap only (home-recap not hidden). */
  tarotContinueMasterName?: string | null;
  onContinueTarot?: () => void;
  onOpenOwnedMatrix?: () => void;
  /**
   * When false, greeting + «Сегодня» daily-cards card are omitted.
   * Auth home keeps the photo hero and hides this duplicate card.
   */
  showHeroBlocks?: boolean;
};

export default function PersonalZovusHome({
  userName,
  accountCreatedAt,
  dailyCardsState,
  dailyCooldownHint,
  onOpenDailyCards,
  onViewTodayDailyCards,
  onPickRegularSpread,
  tarotContinueMasterName,
  onContinueTarot,
  onOpenOwnedMatrix,
  showHeroBlocks = true,
}: PersonalZovusHomeProps) {
  const greetingName = userName?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "";
  const { owned: matrixOwned, loading: matrixLoading } = useMatrixOwnership({ enabled: true });
  const { humanDesignEnabled } = usePlatformFeatures();
  const [natalChartReady, setNatalChartReady] = useState(false);
  const [hdChartId, setHdChartId] = useState<string | null>(null);
  const [continueReady, setContinueReady] = useState(false);
  const viewed = useRef(false);
  const homeViewed = useRef(false);
  const retentionEmitted = useRef(false);

  useEffect(() => {
    if (homeViewed.current) return;
    homeViewed.current = true;
    trackPersonalZovusEvent("personal_home_view", {
      product: "home",
      source: "personal_zovus",
    });
  }, []);

  useEffect(() => {
    if (!showHeroBlocks) return;
    if (viewed.current) return;
    if (!dailyCardsState || dailyCardsState === "loading") return;
    viewed.current = true;
    if (dailyCardsState === "available") trackDailyCardsOfferView("personal_zovus");
    else trackDailyCardsReturnView("personal_zovus");
  }, [dailyCardsState, showHeroBlocks]);

  // Retention return: server createdAt only; sessionStorage dedupe is UX-only.
  useEffect(() => {
    if (retentionEmitted.current) return;
    const state = resolveAuthRetentionState({ createdAt: accountCreatedAt });
    if (!state) return;
    try {
      if (typeof sessionStorage !== "undefined" && sessionStorage.getItem(RETENTION_SESSION_KEY)) {
        retentionEmitted.current = true;
        return;
      }
    } catch {
      /* private mode */
    }
    retentionEmitted.current = true;
    trackRetentionReturn(state);
    try {
      sessionStorage.setItem(RETENTION_SESSION_KEY, state);
    } catch {
      /* ignore */
    }
  }, [accountCreatedAt]);

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
  const featuredContinue = continueItems[0];
  const restContinue = continueItems.slice(1);

  const handleContinue = (item: PersonalContinueItem) => {
    trackPersonalZovusEvent("personal_continue_click", {
      product: continueKindToProduct(item.kind),
      source: "continue",
    });
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
    <section
      className={showHeroBlocks ? "personal-zovus" : "personal-zovus personal-zovus--atelier"}
      aria-labelledby={showHeroBlocks ? "personal-zovus-title" : "personal-zovus-explore"}
    >
      {showHeroBlocks ? (
        <>
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
              <DailyCardsReminderToggle />
            </div>
          </div>
        </>
      ) : null}

      {featuredContinue ? (
        <div className="auth-atelier-section" aria-labelledby="personal-zovus-continue">
          <h2 id="personal-zovus-continue" className="auth-atelier-kicker">
            Продолжить
          </h2>
          <button
            type="button"
            className="auth-atelier-continue__featured"
            onClick={() => handleContinue(featuredContinue)}
          >
            <span className="auth-atelier-continue__featured-title">
              {featuredContinue.title}
            </span>
            <span className="auth-atelier-continue__featured-text">
              {featuredContinue.subtitle}
            </span>
          </button>
          {restContinue.length > 0 ? (
            <ul className="auth-atelier-continue__list">
              {restContinue.map((item) => (
                <li key={item.kind}>
                  <button
                    type="button"
                    className="auth-atelier-continue__item"
                    onClick={() => handleContinue(item)}
                  >
                    <span className="auth-atelier-continue__item-title">{item.title}</span>
                    <span className="auth-atelier-continue__item-text">{item.subtitle}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="auth-atelier-section" aria-labelledby="personal-zovus-explore">
        <h2 id="personal-zovus-explore" className="auth-atelier-kicker">
          Пространство Zovus
        </h2>
        <div className="auth-atelier-explore">
          {explore
            .filter((e) => e.weight === "featured")
            .map((entry) => (
              <Link
                key={entry.id}
                href={entry.href!}
                className="auth-atelier-explore__featured"
                onClick={() => {
                  trackPersonalZovusEvent("personal_explore_click", {
                    product: exploreIdToProduct(entry.id),
                    source: "explore",
                  });
                }}
              >
                <span className="auth-atelier-explore__featured-title">{entry.title}</span>
                <span className="auth-atelier-explore__featured-text">{entry.blurb}</span>
              </Link>
            ))}
          <div className="auth-atelier-explore__side">
            {explore
              .filter((e) => e.weight === "secondary")
              .map((entry) => (
                <Link
                  key={entry.id}
                  href={entry.href!}
                  className="auth-atelier-explore__link"
                  onClick={() => {
                    trackPersonalZovusEvent("personal_explore_click", {
                      product: exploreIdToProduct(entry.id),
                      source: "explore",
                    });
                  }}
                >
                  <span className="auth-atelier-explore__link-title">{entry.title}</span>
                  <span className="auth-atelier-explore__link-text">{entry.blurb}</span>
                </Link>
              ))}
          </div>
          <div className="auth-atelier-explore__compact">
            {explore
              .filter((e) => e.weight === "compact")
              .map((entry) => {
                if (entry.kind === "action") {
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className="auth-atelier-explore__compact-link"
                      onClick={() => {
                        trackPersonalZovusEvent("personal_explore_click", {
                          product: exploreIdToProduct(entry.id),
                          source: "explore",
                        });
                        onPickRegularSpread();
                      }}
                    >
                      {entry.title}
                    </button>
                  );
                }
                return (
                  <Link
                    key={entry.id}
                    href={entry.href!}
                    className="auth-atelier-explore__compact-link"
                    onClick={() => {
                      trackPersonalZovusEvent("personal_explore_click", {
                        product: exploreIdToProduct(entry.id),
                        source: "explore",
                      });
                    }}
                  >
                    {entry.title}
                  </Link>
                );
              })}
          </div>
        </div>
      </div>
    </section>
  );
}
