"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, UserRound } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { MASTER_PUBLIC_BADGE } from "@/lib/master-disclosure";
import { isRitualMaster, RITUAL_MASTER_SHOWCASE_BADGE } from "@/lib/ritual-config";
import { formatMasterPriceDisplay } from "@/lib/master-pricing";
import { resolveMasterDeckSystem } from "@/lib/decks";
import MasterAvatar from "@/components/MasterAvatar";

function formatDisplayName(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .map((part) => {
      if (!part) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join(" ");
}

function CardBadge({
  children,
  variant = "neutral",
}: {
  children: ReactNode;
  variant?: "accent" | "neutral";
}) {
  return (
    <span
      className={`master-showcase-card__badge ${
        variant === "accent"
          ? "master-showcase-card__badge--accent"
          : "master-showcase-card__badge--neutral"
      }`}
    >
      {children}
    </span>
  );
}

export interface MasterShowcaseCardProps {
  master: ShowcaseMaster;
  index: number;
  recommended?: boolean;
  canContinue?: boolean;
  sessionOnly?: boolean;
  readingCost?: number;
  questionCost?: number;
  runesEnabled?: boolean;
  formatRunes?: (amount: number) => string;
  onSelect: (masterId: string) => void;
  onBrowseDeck?: (master: ShowcaseMaster) => void;
  compact?: boolean;
  actionBlocked?: boolean;
}

export default function MasterShowcaseCard({
  master,
  index,
  recommended = false,
  canContinue = false,
  sessionOnly = false,
  readingCost,
  questionCost,
  runesEnabled = false,
  formatRunes,
  onSelect,
  compact = true,
  actionBlocked = false,
}: MasterShowcaseCardProps) {
  const deckSystem = master.system ?? resolveMasterDeckSystem(master.id);
  const price = formatMasterPriceDisplay({
    system: deckSystem,
    priceFrom: master.priceFrom,
    runesEnabled,
    readingCost,
    questionCost,
    sessionOnly,
    formatRunes,
  });

  const ctaLabel = canContinue ? "Продолжить" : "Начать";
  const displayName = formatDisplayName(master.name);

  return (
    <motion.article
      className={`master-showcase-card master-showcase-card--gallery group relative h-full ${
        compact ? "master-showcase-card--compact" : ""
      } ${recommended ? "master-showcase-card--recommended" : ""}`}
      style={{ "--master-glow": master.glowColor } as CSSProperties}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="master-showcase-card__glow pointer-events-none" aria-hidden />

      <div className="master-showcase-card__inner">
        <div className="master-showcase-card__avatar-ring">
          <MasterAvatar
            masterId={master.id}
            masterName={master.name}
            size="grid"
            hoverZoom
            priority={index < 5}
          />
        </div>

        <div className="master-showcase-card__badges-slot">
          {recommended ? <CardBadge variant="accent">Вам</CardBadge> : null}
          {canContinue ? <CardBadge variant="accent">Готово</CardBadge> : null}
          {isRitualMaster(master.id) ? (
            <CardBadge variant="neutral">{RITUAL_MASTER_SHOWCASE_BADGE}</CardBadge>
          ) : null}
          <CardBadge variant="neutral">
            <UserRound className="master-showcase-card__badge-icon" aria-hidden />
            {MASTER_PUBLIC_BADGE}
          </CardBadge>
        </div>

        <h3 className="master-showcase-card__name">{displayName}</h3>
        <p className="master-showcase-card__system">{master.title}</p>

        {master.sessions ? (
          <p className="master-showcase-card__meta">
            <span className="master-showcase-card__meta-item">{master.sessions}</span>
          </p>
        ) : null}

        <p className="master-showcase-card__price">
          <span className="master-showcase-card__price-amount">{price.amount}</span>
          {price.unit ? (
            <span className="master-showcase-card__price-unit"> {price.unit}</span>
          ) : null}
        </p>

        <button
          type="button"
          onClick={() => onSelect(master.id)}
          disabled={actionBlocked}
          className="master-showcase-card__cta disabled:cursor-not-allowed disabled:opacity-50"
        >
          {actionBlocked ? "Нужны руны" : ctaLabel}
          <ArrowRight className="master-showcase-card__cta-arrow" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}
