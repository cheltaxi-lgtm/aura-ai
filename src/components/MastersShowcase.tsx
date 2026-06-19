"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MasterShowcaseCard from "@/components/MasterShowcaseCard";

type Filter = "all" | "ai" | "human";

interface MastersShowcaseProps {
  masters: ShowcaseMaster[];
  onSelect: (masterId: string) => void;
  recommendedId?: string;
  /** Masters who already have a reading for the current spread — show "Continue" */
  continueMasterIds?: string[];
  /** At least one master already decoded this triplet — others offer session-only chat */
  spreadReadingDone?: boolean;
  /** Цена расшифровки в рунах (если задано — показываем вместо priceFrom) */
  readingCost?: number;
  questionCost?: number;
  runesEnabled?: boolean;
  formatRunes?: (amount: number) => string;
  title?: string;
  subtitle?: string;
  showExpertCta?: boolean;
  className?: string;
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
  title = "Мастера Aura",
  subtitle = "AI-наставники платформы и живые эксперты с авторским стилем",
  showExpertCta = true,
  className = "",
}: MastersShowcaseProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const continueSet = useMemo(() => new Set(continueMasterIds), [continueMasterIds]);

  const filtered = useMemo(() => {
    if (filter === "all") return masters;
    return masters.filter((m) => m.kind === filter);
  }, [masters, filter]);

  const counts = useMemo(
    () => ({
      all: masters.length,
      ai: masters.filter((m) => m.kind === "ai").length,
      human: masters.filter((m) => m.kind === "human").length,
    }),
    [masters]
  );

  return (
    <section id="наставники" className={`scroll-mt-24 ${className}`.trim()}>
      <div className="mb-8 text-center">
        <h2 className="font-display text-2xl font-semibold tracking-tight text-gray-300 md:text-3xl">{title}</h2>
        <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-gray-500">{subtitle}</p>
      </div>

      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {(
          [
            { id: "all" as const, label: `Все (${counts.all})` },
            { id: "ai" as const, label: `AI (${counts.ai})` },
            { id: "human" as const, label: `Эксперты (${counts.human})` },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-full border px-4 py-2 text-xs transition-colors ${
              filter === tab.id
                ? "border-aura-purple/50 bg-aura-purple/20 text-aura-neon"
                : "border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="master-showcase-grid">
        {filtered.map((master, index) => {
          const canContinue = continueSet.has(master.id);
          const sessionOnly = spreadReadingDone && !canContinue;

          return (
            <MasterShowcaseCard
              key={master.id}
              master={master}
              index={index}
              recommended={recommendedId === master.id}
              canContinue={canContinue}
              sessionOnly={sessionOnly}
              readingCost={readingCost}
              questionCost={questionCost}
              runesEnabled={runesEnabled}
              formatRunes={formatRunes}
              onSelect={onSelect}
            />
          );
        })}
      </div>

      {showExpertCta && (
        <motion.div
          className="glass-panel mt-10 flex flex-col items-center justify-between gap-4 p-6 sm:flex-row"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <div>
            <p className="font-display text-lg font-semibold text-white">Вы — эзотерик или таролог?</p>
            <p className="mt-1 text-sm text-gray-500">
              Регистрируйтесь на площадке, получайте клиентов и white-label страницу
            </p>
          </div>
          <Link
            href="/auth/expert/register"
            className="btn-neon shrink-0 px-6 py-3 text-sm"
          >
            Стать мастером
          </Link>
        </motion.div>
      )}
    </section>
  );
}

