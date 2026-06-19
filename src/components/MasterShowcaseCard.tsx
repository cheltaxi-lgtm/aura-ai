"use client";

import type { CSSProperties, ReactNode } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Bot, Star, UserRound } from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";

function CardBadge({
  children,
  variant = "default",
}: {
  children: ReactNode;
  variant?: "gold" | "emerald" | "purple" | "default";
}) {
  const styles = {
    gold: "border-aura-gold/35 bg-aura-gold/10 text-aura-gold",
    emerald: "border-aura-emerald/35 bg-aura-emerald/10 text-aura-emerald",
    purple: "border-aura-purple/35 bg-aura-purple/10 text-aura-neon",
    default: "border-white/15 bg-white/5 text-gray-300",
  }[variant];

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium tracking-wide backdrop-blur-sm ${styles}`}
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
      className={`master-showcase-card group relative flex h-full flex-col bg-gradient-to-br ${master.gradient} ${
        recommended ? "ring-2 ring-aura-gold/45 ring-offset-2 ring-offset-aura-bg" : ""
      }`}
      style={{ "--master-glow": master.glowColor } as CSSProperties}
      initial={{ opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.45, delay: index * 0.05 }}
      whileHover={{ scale: 1.02, y: -4 }}
    >
      <div className="master-showcase-card__sheen pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/10 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

      <div className="relative z-10 flex flex-1 flex-col p-6">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <span className="text-4xl leading-none drop-shadow-sm" aria-hidden>
            {master.emoji}
          </span>
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

        <h3 className="font-display mb-1.5 text-2xl font-bold leading-tight tracking-tight text-white">
          {master.name}
        </h3>
        <p className="mb-2 text-sm leading-relaxed tracking-wide text-aura-purple/85">{master.title}</p>
        <p className="mb-2 line-clamp-2 text-sm leading-relaxed text-gray-400">{master.specialty}</p>
        <p className="line-clamp-2 text-xs leading-relaxed text-gray-500">{master.style}</p>

        <div className="min-h-4 flex-1" aria-hidden />

        <div className="master-showcase-stats mb-5 grid grid-cols-3 gap-3 border-t border-white/10 pt-4">
          <div className="min-w-0">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-600">Рейтинг</p>
            <p className="flex items-center gap-1 text-sm font-semibold leading-none text-aura-gold">
              <Star className="h-3.5 w-3.5 shrink-0 fill-aura-gold" aria-hidden />
              <span>{master.rating}</span>
            </p>
          </div>
          <div className="min-w-0 border-x border-white/5 px-2 text-center">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-600">Опыт</p>
            <p className="text-xs font-medium leading-snug text-gray-400">{master.sessions}</p>
          </div>
          <div className="min-w-0 text-right">
            <p className="mb-1 text-[10px] uppercase tracking-wider text-gray-600">Стоимость</p>
            <p className="text-xs font-semibold leading-snug text-gray-200">{priceLabel}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => onSelect(master.id)}
          className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-medium transition-all duration-300 ${
            canContinue
              ? "btn-neon border-0"
              : "border border-white/20 bg-white/5 text-white hover:border-white/35 hover:bg-white/10 hover:shadow-[0_0_24px_-8px_rgba(168,85,247,0.45)]"
          }`}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden />
        </button>
      </div>
    </motion.article>
  );
}
