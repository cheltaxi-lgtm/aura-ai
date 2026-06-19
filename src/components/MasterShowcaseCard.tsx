"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Star, UserRound } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { formatMasterPriceDisplay } from "@/lib/master-pricing";
import { getDeckDefinition, resolveMasterDeckSystem } from "@/lib/decks";
import MasterAvatar from "@/components/MasterAvatar";

function CardBadge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "gold" | "emerald" | "purple" | "default";
}) {
  const styles = {
    gold: "lux-badge lux-badge--gold",
    emerald: "lux-badge lux-badge--emerald",
    purple: "lux-badge lux-badge--purple",
    default: "lux-badge",
  }[variant];

  return <span className={`${styles} shrink-0 whitespace-nowrap`}>{children}</span>;
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
  const kindBadge =
    master.kind === "ai" ? (
      <>
        <Bot className="h-2.5 w-2.5" /> AI
      </>
    ) : (
      <>
        <UserRound className="h-2.5 w-2.5" /> Эксперт
      </>
    );

  return (
    <motion.article
      className={`master-showcase-card master-showcase-card--gallery group relative h-full overflow-hidden ${
        compact ? "master-showcase-card--compact" : ""
      } ${recommended ? "master-showcase-card--recommended" : ""}`}
      style={{ "--master-glow": master.glowColor } as CSSProperties}
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
    >
      <div className="master-showcase-card__glow pointer-events-none" aria-hidden />

      <div className="master-showcase-card__head">
        <div className="master-showcase-card__avatar-ring">
          <MasterAvatar
            masterId={master.id}
            masterName={master.name}
            size="grid"
            hoverZoom
            priority={index < 5}
          />
        </div>
        <div className="master-showcase-card__badges-row">
          {recommended ? <CardBadge variant="gold">Вам</CardBadge> : null}
          {canContinue ? <CardBadge variant="emerald">Готово</CardBadge> : null}
          <CardBadge variant={master.kind === "ai" ? "purple" : "emerald"}>{kindBadge}</CardBadge>
        </div>
      </div>

      <div className="master-showcase-card__body relative z-10">
        <h3 className="font-display master-showcase-card__name text-aura-ivory">{master.name}</h3>
        <p className="master-showcase-card__system text-aura-champagne/85">{master.title}</p>

        <p className="master-showcase-stats-dense master-showcase-stats-dense--compact">
          <span className="master-showcase-stats-dense__item">
            <Star className="lux-star h-2.5 w-2.5 shrink-0" aria-hidden />
            {master.rating}
          </span>
          <span className="master-showcase-stats-dense__sep" aria-hidden>
            ·
          </span>
          <span className="master-showcase-stats-dense__item">{master.sessions}</span>
          <span className="master-showcase-stats-dense__sep" aria-hidden>
            ·
          </span>
          <span className="master-showcase-stats-dense__item">
            {price.amount}
            {price.unit ? (
              <span className="master-showcase-stats-dense__unit"> {price.unit}</span>
            ) : null}
          </span>
        </p>

        <button
          type="button"
          onClick={() => onSelect(master.id)}
          className="master-showcase-card__cta btn-primary"
        >
          <span>{ctaLabel}</span>
          <ArrowRight className="h-3.5 w-3.5 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}
