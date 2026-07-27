"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { useMotionLite } from "@/lib/motion-lite";
import { ArrowRight, UserRound } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { MASTER_SHOWCASE_BADGE } from "@/lib/master-disclosure";
import { isRitualMaster, RITUAL_MASTER_SHOWCASE_BADGE } from "@/lib/ritual-config";
import { formatMasterPriceDisplay, type MasterPriceKind } from "@/lib/master-pricing";
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
  priceKind?: MasterPriceKind;
  readingCost?: number;
  questionCost?: number;
  runesEnabled?: boolean;
  formatRunes?: (amount: number) => string;
  onSelect: (masterId: string) => void;
  onBrowseDeck?: (master: ShowcaseMaster) => void;
  compact?: boolean;
  actionBlocked?: boolean;
  /** Guest landing: hide price, duplicate badges; warm palette; outline CTA. */
  guestLanding?: boolean;
}

export default function MasterShowcaseCard({
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
  compact = true,
  actionBlocked = false,
  guestLanding = false,
}: MasterShowcaseCardProps) {
  const motionLite = useMotionLite();
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

  const ctaLabel = canContinue ? "Продолжить" : "Начать";
  const displayName = formatDisplayName(master.name);
  const warmGlow = "rgba(201, 162, 74, 0.35)";

  return (
    <motion.article
      className={`master-showcase-card master-showcase-card--gallery group relative h-full ${
        compact ? "master-showcase-card--compact" : ""
      } ${recommended ? "master-showcase-card--recommended" : ""} ${
        guestLanding ? "master-showcase-card--guest-landing" : ""
      }`}
      style={{ "--master-glow": guestLanding ? warmGlow : master.glowColor } as CSSProperties}
      // Never start at opacity 0 — cards must be visible on first paint / soft nav.
      initial={false}
      whileInView={motionLite ? undefined : { y: 0 }}
      viewport={motionLite ? undefined : { once: true, margin: "-32px" }}
      transition={
        motionLite
          ? undefined
          : { duration: 0.4, delay: Math.min(index, 6) * 0.04, ease: [0.22, 1, 0.36, 1] }
      }
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

        {!guestLanding ? (
          <div className="master-showcase-card__badges-slot">
            {recommended ? <CardBadge variant="accent">Вам</CardBadge> : null}
            {canContinue ? <CardBadge variant="accent">Готово</CardBadge> : null}
            {isRitualMaster(master.id) ? (
              <CardBadge variant="neutral">{RITUAL_MASTER_SHOWCASE_BADGE}</CardBadge>
            ) : null}
            <CardBadge variant="neutral">
              <UserRound className="master-showcase-card__badge-icon" aria-hidden />
              {MASTER_SHOWCASE_BADGE}
            </CardBadge>
          </div>
        ) : recommended || canContinue ? (
          <div className="master-showcase-card__badges-slot">
            {recommended ? <CardBadge variant="accent">Вам</CardBadge> : null}
            {canContinue ? <CardBadge variant="accent">Готово</CardBadge> : null}
          </div>
        ) : null}

        <h3 className="master-showcase-card__name">{displayName}</h3>
        <p className="master-showcase-card__system">{master.title}</p>
        {master.specialty ? (
          <p className="master-showcase-card__meta">
            <span className="master-showcase-card__meta-item">{master.specialty}</span>
          </p>
        ) : master.sessions ? (
          <p className="master-showcase-card__meta">
            <span className="master-showcase-card__meta-item">{master.sessions}</span>
          </p>
        ) : null}

        {!guestLanding ? (
          <p className="master-showcase-card__price">
            <span className="master-showcase-card__price-amount">{price.amount}</span>
            {price.unit ? (
              <span className="master-showcase-card__price-unit"> {price.unit}</span>
            ) : null}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => onSelect(master.id)}
          disabled={actionBlocked}
          aria-label={`${actionBlocked ? "Нужны руны" : ctaLabel} сеанс с ${displayName}`}
          className={`master-showcase-card__cta disabled:cursor-not-allowed disabled:opacity-50 ${
            guestLanding ? "master-showcase-card__cta--secondary" : ""
          }`}
        >
          {actionBlocked ? "Нужны руны" : canContinue ? "Продолжить сеанс" : "Начать сеанс"}
          <ArrowRight className="master-showcase-card__cta-arrow" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}
