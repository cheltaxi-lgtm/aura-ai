"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MasterShowcaseCard from "@/components/MasterShowcaseCard";
import MasterListRow from "@/components/MasterListRow";
import MasterServiceDisclaimer from "@/components/MasterServiceDisclaimer";
import { MASTER_SECTION_SUBTITLE } from "@/lib/master-disclosure";
import { canAffordRunes } from "@/lib/rune-afford-client";

type ShowcaseLayout = "grid" | "list";

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
  className?: string;
  onBrowseDeck?: (master: ShowcaseMaster) => void;
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
  className = "",
}: MastersShowcaseProps) {
  const continueSet = useMemo(() => new Set(continueMasterIds), [continueMasterIds]);

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
      />
    );
  });

  if (layout === "list") {
    return (
      <section id="наставники" className={`master-showcase-section scroll-mt-24 ${className}`.trim()}>
        {(title || subtitle) && (
          <div className="master-showcase-section__head mb-4">
            {title ? <h2 className="font-display master-showcase-section__title">{title}</h2> : null}
            {subtitle ? <p className="master-showcase-section__subtitle">{subtitle}</p> : null}
          </div>
        )}

        <div className="master-picker-panel glass-panel mx-auto max-w-xl">
          <ul className="master-list">{listBody}</ul>

          {showDisclaimer ? (
            <MasterServiceDisclaimer className="master-picker-panel__footer px-4 pb-4" />
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
      </section>
    );
  }

  return (
    <section id="наставники" className={`master-showcase-section scroll-mt-24 ${className}`.trim()}>
      <div className="mx-auto w-full max-w-[1120px] px-4 sm:px-6">
        <div className="master-showcase-section__head">
          <h2 className="font-display master-showcase-section__title">{title}</h2>
          <p className="master-showcase-section__subtitle">{subtitle}</p>
        </div>

        <div
          className="master-showcase-grid mx-auto grid w-full max-w-[390px] grid-cols-1 justify-items-center gap-7 px-1 sm:max-w-[760px] sm:grid-cols-2 sm:gap-7 lg:max-w-[1120px] lg:grid-cols-3 lg:gap-8 [&_.master-showcase-card]:w-full [&_.master-showcase-card]:max-w-[350px]"
        >
          {listBody}
        </div>

        {showDisclaimer ? (
          <MasterServiceDisclaimer className="master-showcase-section__disclaimer mx-auto mt-6 max-w-3xl text-center" />
        ) : null}

        {showExpertCta ? (
          <motion.div
            className="glass-panel master-showcase-section__expert-cta flex flex-col items-center justify-between gap-3 p-4 sm:flex-row"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <div>
              <p className="font-display text-lg font-semibold text-white">Вы — эзотерик или таролог?</p>
              <p className="mt-1 text-sm text-gray-500">
                Регистрируйтесь как эксперт, подключайте свои материалы к ИИ-образу и получайте white-label страницу
              </p>
            </div>
            <Link href="/auth/expert/register" className="btn-neon shrink-0 px-6 py-3 text-sm">
              Стать мастером
            </Link>
          </motion.div>
        ) : null}
      </div>
    </section>
  );
}
