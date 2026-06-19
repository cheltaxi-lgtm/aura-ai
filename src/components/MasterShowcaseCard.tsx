"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Layers, Star, UserRound } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { formatMasterPriceDisplay } from "@/lib/master-pricing";
import { masterTagline } from "@/data/master-avatars";
import { getDeckDefinition, resolveMasterDeckSystem } from "@/lib/decks";
import { DECK_SYSTEM_LABEL } from "@/lib/deck-card-utils";
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
  onBrowseDeck,
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
  const deckCount = getDeckDefinition(deckSystem).symbols.length;
  const deckUnit = DECK_SYSTEM_LABEL[deckSystem];

  return (
    <motion.article
      className={`master-showcase-card master-showcase-card--gallery group relative h-full overflow-hidden ${
        recommended ? "master-showcase-card--recommended" : ""
      }`}
      style={{ "--master-glow": master.glowColor } as CSSProperties}
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.55, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -3 }}
    >
      <div className="master-showcase-card__glow pointer-events-none" aria-hidden />

      <div className="master-showcase-card__portrait-wrap">
        <MasterAvatar
          masterId={master.id}
          masterName={master.name}
          size="showcase"
          hoverZoom
          priority={index < 4}
        />
        <div className="master-showcase-card__badges-overlay">
          {recommended ? <CardBadge variant="gold">Подходит вам</CardBadge> : null}
          {canContinue ? <CardBadge variant="emerald">Расшифровка готова</CardBadge> : null}
          <CardBadge variant={master.kind === "ai" ? "purple" : "emerald"}>
            {master.kind === "ai" ? (
              <>
                <Bot className="h-2.5 w-2.5" /> AI
              </>
            ) : (
              <>
                <UserRound className="h-2.5 w-2.5" /> Эксперт
              </>
            )}
          </CardBadge>
        </div>
      </div>

      <div className="master-showcase-card__body relative z-10">
        <h3 className="font-display master-showcase-card__name text-aura-ivory">
          {master.name}
        </h3>
        <p className="master-showcase-card__system text-aura-champagne/85">{master.title}</p>
        <p className="master-showcase-card__tagline text-aura-ivory/55">
          {masterTagline(master.id, master.specialty)}
        </p>

        <p className="master-showcase-stats-dense">
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

        {onBrowseDeck ? (
          <button
            type="button"
            onClick={() => onBrowseDeck(master)}
            className="master-showcase-deck-link"
          >
            <Layers className="h-3 w-3 shrink-0" aria-hidden />
            Вся колода · {deckCount} {deckUnit}
          </button>
        ) : null}

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
