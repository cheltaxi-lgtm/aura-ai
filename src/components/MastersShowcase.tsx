"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MasterShowcaseCard from "@/components/MasterShowcaseCard";
import MasterListRow from "@/components/MasterListRow";
import MasterAvatar from "@/components/MasterAvatar";
import MasterServiceDisclaimer from "@/components/MasterServiceDisclaimer";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { MASTER_SECTION_SUBTITLE } from "@/lib/master-disclosure";
import { canAffordRunes } from "@/lib/rune-afford-client";

type ShowcaseLayout = "grid" | "list" | "atelier";

interface MastersShowcaseProps {
  masters: ShowcaseMaster[];
  onSelect: (masterId: string) => void;
  recommendedId?: string;
  continueMasterIds?: string[];
  spreadReadingDone?: boolean;
  readingCost?: number;
  questionCost?: number;
  runesEnabled?: boolean;
  formatRunes?: (amount: number) => string;
  runeBalance?: number;
  isUnlimited?: boolean;
  /** Guests may choose a master before registration; enforce wallet balance only for signed-in users. */
  enforceBalance?: boolean;
  onInsufficientRunes?: (payload: { balance: number; required: number }) => void;
  title?: string;
  subtitle?: string;
  showExpertCta?: boolean;
  showDisclaimer?: boolean;
  layout?: ShowcaseLayout;
  rowVariant?: "default" | "editorial";
  className?: string;
  onBrowseDeck?: (master: ShowcaseMaster) => void;
  /** Guest landing: hide prices/badges, warm cards, sixth “all masters” tile. */
  guestLanding?: boolean;
}

export default function MastersShowcase({
  masters,
  onSelect,
  recommendedId,
  continueMasterIds = [],
  spreadReadingDone = false,
  readingCost,
  questionCost,
  runesEnabled = false,
  formatRunes,
  runeBalance = 0,
  isUnlimited = false,
  enforceBalance = true,
  onInsufficientRunes,
  onBrowseDeck,
  title = "Мастера Zovus",
  subtitle = MASTER_SECTION_SUBTITLE,
  showExpertCta = false,
  showDisclaimer = true,
  layout = "grid",
  rowVariant = "default",
  className = "",
  guestLanding = false,
}: MastersShowcaseProps) {
  const continueSet = useMemo(() => new Set(continueMasterIds), [continueMasterIds]);
  const { ref: revealRef, className: revealClass } = useScrollReveal<HTMLElement>();

  const selectMaster = (master: ShowcaseMaster) => {
    const canContinue = continueSet.has(master.id);
    const requiredCost = canContinue
      ? (readingCost ?? 0)
      : (questionCost ?? readingCost ?? 0);
    const actionBlocked =
      enforceBalance &&
      runesEnabled &&
      !isUnlimited &&
      !canContinue &&
      !canAffordRunes({
        enabled: runesEnabled,
        unlimited: isUnlimited,
        balance: runeBalance,
        cost: requiredCost,
      });
    if (actionBlocked) {
      onInsufficientRunes?.({ balance: runeBalance, required: requiredCost });
      return;
    }
    onSelect(master.id);
  };

  if (layout === "atelier") {
    const featured =
      masters.find((m) => m.id === recommendedId) ?? masters[0] ?? null;
    const rest = featured ? masters.filter((m) => m.id !== featured.id) : masters;
    return (
      <section
        ref={revealRef}
        id="наставники"
        className={`master-showcase-section master-showcase-section--atelier scroll-mt-24 ${revealClass} ${className}`.trim()}
      >
        {(title || subtitle) && (
          <div className="master-showcase-section__head">
            {title ? (
              <h2 className="font-display master-showcase-section__title">{title}</h2>
            ) : null}
            {subtitle ? (
              <p className="master-showcase-section__subtitle">{subtitle}</p>
            ) : null}
          </div>
        )}
        <div className="auth-atelier-masters">
          {featured ? (
            <button
              type="button"
              className="auth-atelier-masters__featured"
              onClick={() => selectMaster(featured)}
            >
              <span className="auth-atelier-masters__portrait" aria-hidden>
                <MasterAvatar
                  masterId={featured.id}
                  masterName={featured.name}
                  size="showcase"
                />
              </span>
              <span>
                <span className="auth-atelier-masters__name">{featured.name}</span>
                <span className="auth-atelier-masters__meta">{featured.title}</span>
              </span>
            </button>
          ) : null}
          <ul className="auth-atelier-masters__list">
            {rest.map((master) => (
              <li key={master.id}>
                <button
                  type="button"
                  className="auth-atelier-masters__row"
                  onClick={() => selectMaster(master)}
                >
                  <span className="auth-atelier-masters__row-name">{master.name}</span>
                  <span className="auth-atelier-masters__row-meta">{master.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </section>
    );
  }

  const listBody = masters.map((master, index) => {
    const canContinue = continueSet.has(master.id);
    const sessionOnly = !canContinue;
    const priceKind: "reading" | "question" =
      !enforceBalance ? "reading" : sessionOnly ? "question" : "reading";
    const requiredCost = canContinue
      ? (readingCost ?? 0)
      : (questionCost ?? readingCost ?? 0);
    const actionBlocked =
      enforceBalance &&
      runesEnabled &&
      !isUnlimited &&
      !canContinue &&
      !canAffordRunes({
        enabled: runesEnabled,
        unlimited: isUnlimited,
        balance: runeBalance,
        cost: requiredCost,
      });

    const handleSelect = (masterId: string) => {
      if (actionBlocked) {
        onInsufficientRunes?.({ balance: runeBalance, required: requiredCost });
        return;
      }
      onSelect(masterId);
    };

    if (layout === "list") {
      return (
        <MasterListRow
          key={master.id}
          master={master}
          index={index}
          recommended={recommendedId === master.id}
          canContinue={canContinue}
          sessionOnly={sessionOnly}
          priceKind={priceKind}
          readingCost={readingCost}
          questionCost={questionCost}
          runesEnabled={runesEnabled}
          formatRunes={formatRunes}
          onBrowseDeck={onBrowseDeck}
          onSelect={handleSelect}
          actionBlocked={actionBlocked}
          variant={rowVariant}
        />
      );
    }

    return (
      <MasterShowcaseCard
        key={master.id}
        master={master}
        index={index}
        recommended={recommendedId === master.id}
        canContinue={canContinue}
        sessionOnly={sessionOnly}
        priceKind={priceKind}
        readingCost={readingCost}
        questionCost={questionCost}
        runesEnabled={runesEnabled}
        formatRunes={formatRunes}
        onBrowseDeck={onBrowseDeck}
        onSelect={handleSelect}
        actionBlocked={actionBlocked}
        guestLanding={guestLanding}
      />
    );
  });

  if (layout === "list") {
    const inner = (
      <>
        {(title || subtitle) && (
          <div className="master-showcase-section__head mb-6">
            {title ? <h2 className="font-display master-showcase-section__title">{title}</h2> : null}
            {subtitle ? <p className="master-showcase-section__subtitle">{subtitle}</p> : null}
          </div>
        )}

        <div className={`master-picker-panel ${rowVariant === "editorial" ? "" : "glass-panel mx-auto max-w-xl"}`}>
          <ul className={`master-list ${rowVariant === "editorial" ? "editorial-master-list" : ""}`}>{listBody}</ul>

          {showDisclaimer ? (
            <MasterServiceDisclaimer
              className={rowVariant === "editorial" ? "mt-6 text-center" : "master-picker-panel__footer px-4 pb-4"}
            />
          ) : null}

          {showExpertCta ? (
            <p className="master-picker-panel__footer border-t border-white/5 pt-3">
              Эзотерик или таролог?{" "}
              <Link href="/auth/expert/register" className="master-picker-panel__footer-link">
                Стать мастером
              </Link>
            </p>
          ) : null}
        </div>
      </>
    );

    return (
      <section
        ref={revealRef}
        id="наставники"
        className={`master-showcase-section scroll-mt-24 ${revealClass} ${className}`.trim()}
      >
        {rowVariant === "editorial" ? <div className="editorial-landing__inner">{inner}</div> : inner}
      </section>
    );
  }

  return (
    <section
      ref={revealRef}
      id="наставники"
      className={`master-showcase-section scroll-mt-24 ${revealClass} salon-reveal--stagger ${className}`.trim()}
    >
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
        <div
          className="master-showcase-section__head salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          <h2 className="font-display master-showcase-section__title">{title}</h2>
          <p className="master-showcase-section__subtitle">{subtitle}</p>
        </div>

        <div
          className="master-showcase-grid mx-auto grid w-full max-w-[390px] grid-cols-1 justify-items-center gap-7 px-1 sm:max-w-[760px] sm:grid-cols-2 sm:gap-7 lg:max-w-[1120px] lg:grid-cols-3 lg:gap-8 [&_.master-showcase-card]:w-full [&_.master-showcase-card]:max-w-[350px]"
        >
          {listBody}
          {guestLanding ? (
            <Link
              href="/about/masters"
              className="master-showcase-card master-showcase-card--gallery master-showcase-card--compact master-showcase-card--guest-landing master-showcase-card--all-masters group relative flex h-full w-full max-w-[350px] flex-col items-center justify-center gap-3 p-6 text-center no-underline salon-reveal__item"
              style={{ ["--salon-i" as string]: masters.length + 2 }}
            >
              <span className="master-showcase-card__all-arrow" aria-hidden>
                →
              </span>
              <span className="master-showcase-card__name">Все наставники</span>
              <span className="master-showcase-card__system">Смотреть полный список</span>
            </Link>
          ) : null}
        </div>

        {showDisclaimer ? (
          <MasterServiceDisclaimer className="master-showcase-section__disclaimer mx-auto mt-6 max-w-3xl text-center" />
        ) : null}

        {showExpertCta && !guestLanding ? (
          <div className="glass-panel master-showcase-section__expert-cta flex flex-col items-center justify-between gap-3 p-4 sm:flex-row">
            <div>
              <p className="font-display text-lg font-semibold text-white">Вы — эзотерик или таролог?</p>
              <p className="mt-1 text-sm text-gray-500">
                Регистрируйтесь как эксперт, подключайте свои материалы к образу наставника и получайте свою витрину
              </p>
            </div>
            <Link href="/auth/expert/register" className="btn-primary shrink-0 px-6 py-3 text-sm">
              Стать мастером
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}
