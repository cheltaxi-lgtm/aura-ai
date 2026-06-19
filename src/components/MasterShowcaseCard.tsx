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

  const ctaLabel = canContinue ? "Продолжить" : "Начать сеанс";
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
      whileHover={{ y: -6 }}
    >
      <div className="master-showcase-card__glow pointer-events-none" aria-hidden />

      <div className="master-showcase-card__portrait-wrap">
        <MasterAvatar
          masterId={master.id}
          masterName={master.name}
          size="showcase"
          hoverZoom
          priority={index < 3}
        />
        <div className="master-showcase-card__badges-overlay">
          {recommended ? <CardBadge variant="gold">Подходит вам</CardBadge> : null}
          {canContinue ? <CardBadge variant="emerald">Расшифровка готова</CardBadge> : null}
          <CardBadge variant={master.kind === "ai" ? "purple" : "emerald"}>
            {master.kind === "ai" ? (
              <>
                <Bot className="h-3 w-3" /> AI
              </>
            ) : (
              <>
                <UserRound className="h-3 w-3" /> Эксперт
              </>
            )}
          </CardBadge>
        </div>
      </div>

      <div className="master-showcase-card__body relative z-10 p-5 sm:p-6">
        <h3 className="font-display mb-0.5 text-xl font-semibold leading-tight tracking-tight text-aura-ivory">
          {master.name}
        </h3>
        <p className="master-showcase-card__system mb-2 text-sm text-aura-champagne/85">
          {master.title}
        </p>
        <p className="master-showcase-card__tagline text-sm leading-relaxed text-aura-ivory/60">
          {masterTagline(master.id, master.specialty)}
        </p>

        <div className="lux-divider my-4" aria-hidden />

        <div className="master-showcase-stats master-showcase-stats--compact">
          <div className="master-stat-cell">
            <p className="lux-stat-label mb-1">Рейтинг</p>
            <p className="master-stat__value flex items-center gap-1">
              <Star className="lux-star h-3 w-3 shrink-0" aria-hidden />
              <span>{master.rating}</span>
            </p>
          </div>
          <div className="master-stat-cell master-stat-cell--center">
            <p className="lux-stat-label mb-1">Опыт</p>
            <p className="master-stat__value master-stat__value--sm">{master.sessions}</p>
          </div>
          <div className="master-stat-cell master-stat-cell--end">
            <p className="lux-stat-label mb-1">Стоимость</p>
            <p className="master-stat__value master-stat__value--sm">{price.amount}</p>
            <p className="master-stat__unit">{price.unit}</p>
          </div>
        </div>

        {onBrowseDeck && (
          <button
            type="button"
            onClick={() => onBrowseDeck(master)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-aura-gold/25 bg-aura-gold/5 py-2 text-xs text-aura-champagne transition-colors hover:border-aura-gold/45 hover:bg-aura-gold/10 hover:text-aura-gold"
          >
            <Layers className="h-3.5 w-3.5" />
            Вся колода · {deckCount} {deckUnit}
          </button>
        )}

        <button
          type="button"
          onClick={() => onSelect(master.id)}
          className={`master-showcase-card__cta mt-4 ${
            canContinue ? "btn-primary" : "btn-ghost"
          }`}
        >
          <span>{ctaLabel}</span>
          <ArrowRight className="h-4 w-4 shrink-0 transition-transform group-hover:translate-x-1" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}
