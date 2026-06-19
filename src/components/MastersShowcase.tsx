"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MasterShowcaseCard from "@/components/MasterShowcaseCard";
import MasterListRow from "@/components/MasterListRow";

type Filter = "all" | "ai" | "human";
type ShowcaseLayout = "grid" | "list";

interface MastersShowcaseProps {
  masters: ShowcaseMaster[];
  onSelect: (masterId: string) => void;
  recommendedId?: string;
  continueMasterIds?: string[];
  spreadReadingDone?: boolean;
  readingCost?: number;
  questionCost?: number;
  runesEnabled?: boolean;
  formatRunes?: (amount: number) => string;
  title?: string;
  subtitle?: string;
  showExpertCta?: boolean;
  layout?: ShowcaseLayout;
  className?: string;
  onBrowseDeck?: (master: ShowcaseMaster) => void;
}

const FILTER_TABS = [
  { id: "all" as const, label: "Все" },
  { id: "ai" as const, label: "AI" },
  { id: "human" as const, label: "Эксперты" },
];

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
  onBrowseDeck,
  title = "Мастера Aura",
  subtitle = "AI-наставники платформы и живые эксперты с авторским стилем",
  showExpertCta = true,
  layout = "grid",
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

  const listBody = filtered.map((master, index) => {
    const canContinue = continueSet.has(master.id);
    const sessionOnly = spreadReadingDone && !canContinue;

    if (layout === "list") {
      return (
        <MasterListRow
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
          onBrowseDeck={onBrowseDeck}
          onSelect={onSelect}
        />
      );
    }

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
        onBrowseDeck={onBrowseDeck}
        onSelect={onSelect}
      />
    );
  });

  if (layout === "list") {
    return (
      <section id="наставники" className={`master-showcase-section scroll-mt-24 ${className}`.trim()}>
        {(title || subtitle) && (
          <div className="master-showcase-section__head mb-4">
            {title ? <h2 className="font-display master-showcase-section__title">{title}</h2> : null}
            {subtitle ? <p className="master-showcase-section__subtitle">{subtitle}</p> : null}
          </div>
        )}

        <div className="master-picker-panel glass-panel mx-auto max-w-xl">
          <div className="master-picker-panel__filters" role="tablist" aria-label="Фильтр мастеров">
            {FILTER_TABS.map((tab) => {
              const active = filter === tab.id;
              const count = counts[tab.id];
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setFilter(tab.id)}
                  className={`master-picker-panel__filter ${active ? "master-picker-panel__filter--active" : ""}`}
                >
                  {tab.label}
                  <span className="master-picker-panel__filter-count">{count}</span>
                </button>
              );
            })}
          </div>

          <ul className="master-list">{listBody}</ul>

          {showExpertCta ? (
            <p className="master-picker-panel__footer">
              Эзотерик или таролог?{" "}
              <Link href="/auth/expert/register" className="master-picker-panel__footer-link">
                Стать мастером
              </Link>
            </p>
          ) : null}
        </div>
      </section>
    );
  }

  return (
    <section id="наставники" className={`master-showcase-section scroll-mt-24 ${className}`.trim()}>
      <div className="master-showcase-section__head">
        <h2 className="font-display master-showcase-section__title">{title}</h2>
        <p className="master-showcase-section__subtitle">{subtitle}</p>
      </div>

      <div className="master-showcase-section__filters">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
              filter === tab.id
                ? "border-aura-purple/50 bg-aura-purple/20 text-aura-neon"
                : "border-white/10 text-gray-500 hover:border-white/20 hover:text-gray-300"
            }`}
          >
            {tab.label} ({counts[tab.id]})
          </button>
        ))}
      </div>

      <div className="master-showcase-grid">{listBody}</div>

      {showExpertCta ? (
        <motion.div
          className="glass-panel master-showcase-section__expert-cta flex flex-col items-center justify-between gap-3 p-4 sm:flex-row"
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
          <Link href="/auth/expert/register" className="btn-neon shrink-0 px-6 py-3 text-sm">
            Стать мастером
          </Link>
        </motion.div>
      ) : null}
    </section>
  );
}
