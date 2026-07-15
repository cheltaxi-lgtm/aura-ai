"use client";

import type { MouseEvent } from "react";
import { motion } from "framer-motion";
import { ChevronRight, Layers } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { masterTagline } from "@/data/master-avatars";
import { MASTER_PUBLIC_BADGE } from "@/lib/master-disclosure";
import { isRitualMaster, RITUAL_MASTER_SHOWCASE_BADGE } from "@/lib/ritual-config";
import { formatMasterPriceDisplay, type MasterPriceKind } from "@/lib/master-pricing";
import { getDeckDefinition, resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_SYSTEM_LABEL } from "@/lib/deck-card-utils";
import MasterAvatar from "@/components/MasterAvatar";

export interface MasterListRowProps {
  master: ShowcaseMaster;
  index: number;
  recommended?: boolean;
  canContinue?: boolean;
  sessionOnly?: boolean;
  priceKind?: MasterPriceKind;
  readingCost?: number;
  questionCost?: number;
  runesEnabled?: boolean;
  formatRunes?: (amount: number) => string;
  onSelect: (masterId: string) => void;
  onBrowseDeck?: (master: ShowcaseMaster) => void;
  actionBlocked?: boolean;
  variant?: "default" | "editorial";
}

export default function MasterListRow({
  master,
  index,
  recommended = false,
  canContinue = false,
  sessionOnly = false,
  priceKind,
  readingCost,
  questionCost,
  runesEnabled = false,
  formatRunes,
  onSelect,
  onBrowseDeck,
  actionBlocked = false,
  variant = "default",
}: MasterListRowProps) {
  const deckSystem = master.system ?? resolveMasterDeckSystem(master.id);
  const price = formatMasterPriceDisplay({
    system: deckSystem,
    priceFrom: master.priceFrom,
    runesEnabled,
    readingCost,
    questionCost,
    sessionOnly,
    priceKind,
    formatRunes,
  });
  const deckCount = getDeckDefinition(deckSystem).symbols.length;
  const deckUnit = DECK_SYSTEM_LABEL[deckSystem];
  const kindLabel = MASTER_PUBLIC_BADGE;
  const bio = masterTagline(master.id, master.title);

  const openDeck = (event: MouseEvent) => {
    event.stopPropagation();
    onBrowseDeck?.(master);
  };

  if (variant === "editorial") {
    return (
      <motion.li
        initial={{ opacity: 0, x: -12 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className={`editorial-master-row ${recommended ? "editorial-master-row--recommended" : ""}`}>
          <span className="editorial-master-row__portrait">
            <MasterAvatar masterId={master.id} masterName={master.name} size="sm" priority={index < 3} />
          </span>
          <div className="min-w-0">
            <p className="editorial-master-row__name">
              {master.name}
              {recommended ? (
                <span className="ml-2 text-[10px] uppercase tracking-wide text-[var(--color-accent-light)]">· Вам</span>
              ) : null}
              {canContinue ? (
                <span className="ml-2 text-[10px] uppercase tracking-wide text-emerald-300/90">· Разбор</span>
              ) : null}
              {isRitualMaster(master.id) ? (
                <span className="ml-2 text-[10px] text-violet-200/90">{RITUAL_MASTER_SHOWCASE_BADGE}</span>
              ) : null}
            </p>
            <p className="editorial-master-row__title">{master.title}</p>
            <p className="editorial-master-row__bio">{bio}</p>
          </div>
          <span className="editorial-master-row__price">
            {price.amount}
            {price.unit ? ` ${price.unit}` : ""}
          </span>
          <button
            type="button"
            className="editorial-master-row__cta editorial-btn editorial-btn--gold editorial-btn--sm"
            disabled={actionBlocked}
            onClick={() => onSelect(master.id)}
          >
            Выбрать
          </button>
        </div>
      </motion.li>
    );
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.35, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <button
        type="button"
        onClick={() => onSelect(master.id)}
        disabled={actionBlocked}
        className={`master-list-row ${recommended ? "master-list-row--recommended" : ""} ${
          canContinue ? "master-list-row--continue" : ""
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className="master-list-row__accent" aria-hidden />
        <span className="master-list-row__portrait">
          <MasterAvatar masterId={master.id} masterName={master.name} size="sm" priority={index < 4} />
        </span>

        <span className="master-list-row__copy">
          <span className="master-list-row__line1">
            <span className="master-list-row__name">{master.name}</span>
            <span className="master-list-row__kind">{kindLabel}</span>
            {recommended ? <span className="master-list-row__tag">Вам</span> : null}
            {canContinue ? <span className="master-list-row__tag master-list-row__tag--continue">Разбор</span> : null}
            {isRitualMaster(master.id) ? (
              <span className="master-list-row__tag master-list-row__tag--ritual">
                {RITUAL_MASTER_SHOWCASE_BADGE}
              </span>
            ) : null}
          </span>
          <span className="master-list-row__line2">{master.title}</span>
          <span className="master-list-row__line3">
            {master.sessions ? (
              <>
                {master.sessions}
                <span className="master-list-row__dot" aria-hidden>
                  ·
                </span>
              </>
            ) : null}
            {deckCount} {deckUnit}
            {price.amount ? (
              <>
                <span className="master-list-row__dot" aria-hidden>
                  ·
                </span>
                {price.amount}
                {price.unit ? <span className="master-list-row__price-unit"> {price.unit}</span> : null}
              </>
            ) : null}
          </span>
        </span>

        {onBrowseDeck ? (
          <span
            role="button"
            tabIndex={0}
            onClick={openDeck}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                event.stopPropagation();
                onBrowseDeck(master);
              }
            }}
            className="master-list-row__deck"
            aria-label={`Колода ${master.name}`}
          >
            <Layers className="h-3.5 w-3.5" aria-hidden />
          </span>
        ) : null}

        <ChevronRight className="master-list-row__chevron" aria-hidden />
      </button>
    </motion.li>
  );
}
