"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Star, UserRound } from "lucide-react";
import MasterSigil from "@/components/MasterSigil";
import type { ShowcaseMaster } from "@/lib/showcase-masters";

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

  return <span className={styles}>{children}</span>;
}

export interface MasterShowcaseCardProps {
  master: ShowcaseMaster;
  index: number;
  recommended?: boolean;
  canContinue?: boolean;
  sessionOnly?: boolean;
  readingCost?: number;
  onSelect: (masterId: string) => void;
}

export default function MasterShowcaseCard({
  master,
  index,
  recommended = false,
  canContinue = false,
  sessionOnly = false,
  readingCost,
  onSelect,
}: MasterShowcaseCardProps) {
  const priceLabel =
    sessionOnly
      ? "по рунам за вопрос"
      : readingCost != null && master.kind === "ai"
        ? `от ${readingCost} ᚢ`
        : `от ${master.priceFrom}`;

  const ctaLabel = canContinue
    ? "Продолжить"
    : sessionOnly || master.kind === "human"
      ? "Начать сеанс"
      : "Получить расшифровку";

  return (
    <motion.article
      className={`master-showcase-card group relative flex h-full flex-col ${
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

      <div className="relative z-10 flex flex-1 flex-col p-7">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div className="lux-master-avatar">
            <div className="lux-master-avatar__ring" aria-hidden />
            <MasterSigil masterId={master.id} className="lux-master-avatar__sigil" />
          </div>
          <div className="flex max-w-[58%] flex-col items-end gap-1.5 sm:max-w-[65%]">
            {recommended && <CardBadge variant="gold">Подходит вам</CardBadge>}
            {canContinue && <CardBadge variant="emerald">Расшифровка готова</CardBadge>}
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

        <h3 className="font-display mb-1.5 text-2xl font-semibold leading-tight tracking-tight text-aura-ivory">
          {master.name}
        </h3>
        <p className="mb-2 text-sm leading-relaxed tracking-wide text-aura-champagne/80">
          {master.title}
        </p>
        <p className="mb-2 line-clamp-2 text-sm leading-relaxed text-aura-ivory/65">
          {master.specialty}
        </p>
        <p className="line-clamp-2 text-xs leading-relaxed text-aura-ivory/45">{master.style}</p>

        <div className="min-h-4 flex-1" aria-hidden />

        <div className="lux-divider my-5" aria-hidden />

        <div className="master-showcase-stats mb-6 grid grid-cols-3 gap-3">
          <div className="min-w-0">
            <p className="lux-stat-label mb-1">Рейтинг</p>
            <p className="flex items-center gap-1 text-sm font-medium leading-none text-aura-champagne">
              <Star className="lux-star h-3 w-3 shrink-0" aria-hidden />
              <span>{master.rating}</span>
            </p>
          </div>
          <div className="min-w-0 border-x border-aura-gold/10 px-2 text-center">
            <p className="lux-stat-label mb-1">Опыт</p>
            <p className="text-xs font-medium leading-snug text-aura-ivory/55">{master.sessions}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="lux-stat-label mb-1">Стоимость</p>
            <p className="text-xs font-semibold leading-snug text-aura-ivory/80">{priceLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSelect(master.id)}
          className={canContinue ? "btn-primary w-full" : "btn-ghost w-full"}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}
