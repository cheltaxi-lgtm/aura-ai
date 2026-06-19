"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Star, UserRound } from "lucide-react";
import MasterSigil from "@/components/MasterSigil";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import { formatMasterPriceDisplay } from "@/lib/master-pricing";

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
}: MasterShowcaseCardProps) {
  const price = formatMasterPriceDisplay({
    system: master.system,
    priceFrom: master.priceFrom,
    runesEnabled,
    readingCost,
    questionCost,
    sessionOnly,
    formatRunes,
  });

  const ctaLabel = canContinue ? "Продолжить" : "Начать сеанс";

  return (
    <motion.article
      className={`master-showcase-card group relative h-full ${
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

      <div className="master-showcase-card__body relative z-10 p-6 sm:p-7">
        <div className="master-showcase-card__header mb-5">
          <div className="lux-master-avatar shrink-0">
            <div className="lux-master-avatar__ring" aria-hidden />
            <MasterSigil masterId={master.id} className="lux-master-avatar__sigil" />
          </div>
          <div className="master-showcase-card__badges">
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

        <h3 className="font-display mb-1.5 text-xl font-semibold leading-tight tracking-tight text-aura-ivory sm:text-2xl">
          {master.name}
        </h3>
        <p className="master-showcase-card__theme mb-2 text-sm leading-relaxed tracking-wide text-aura-champagne/80">
          {master.title}
        </p>
        <p className="master-showcase-card__desc text-sm leading-relaxed text-aura-ivory/65">
          {master.specialty}
        </p>
        <p className="master-showcase-card__style mt-2 text-xs leading-relaxed text-aura-ivory/45">
          {master.style}
        </p>

        <div className="lux-divider my-5" aria-hidden />

        <div className="master-showcase-stats">
          <div className="master-stat-cell">
            <p className="lux-stat-label mb-1">Рейтинг</p>
            <p className="master-stat__value flex items-center justify-start gap-1">
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

        <button
          type="button"
          onClick={() => onSelect(master.id)}
          className={`master-showcase-card__cta ${
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
