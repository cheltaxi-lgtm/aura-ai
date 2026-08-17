"use client";

import Link from "next/link";
import { Moon, Sparkles, Sun } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

const BIRTH_TOOLS = [
  {
    id: "matrix",
    href: "/numerology/destiny-matrix",
    title: "Матрица судьбы",
    purpose: "Жизненные темы, сильные стороны и повторяющиеся сценарии",
    need: "Нужна дата рождения",
    cta: "Рассчитать матрицу",
    icon: Sparkles,
  },
  {
    id: "natal",
    href: "/natalnaya-karta",
    title: "Натальная карта",
    purpose: "Характер, потенциал, отношения и личные периоды",
    need: "Нужны дата, время и место рождения",
    cta: "Построить карту",
    icon: Moon,
  },
  {
    id: "hd",
    href: "/dizayn-cheloveka/rasschitat",
    title: "Дизайн человека",
    purpose: "Тип, стратегия, авторитет и центры",
    need: "Нужны дата, время и место рождения",
    cta: "Рассчитать бодиграф",
    icon: Sun,
    requiresHumanDesign: true,
  },
] as const;

/** Guest landing: help choose between Matrix, Natal, and Human Design. */
export default function EditorialBirthToolsSection() {
  const { ref, className } = useScrollReveal<HTMLElement>();
  const { humanDesignEnabled } = usePlatformFeatures();

  return (
    <section ref={ref} className={`editorial-section ${className} salon-reveal--stagger`}>
      <div className="editorial-landing__inner">
        <h2
          className="editorial-section__title salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          Что выбрать по дате рождения?
        </h2>
        <div className="editorial-birth-tools__grid">
          {BIRTH_TOOLS.map((tool, index) => {
            if ("requiresHumanDesign" in tool && tool.requiresHumanDesign && !humanDesignEnabled) {
              return null;
            }
            const Icon = tool.icon;
            return (
              <Link
                key={tool.id}
                href={tool.href}
                className="salon-reveal__item group block rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-amber-300/40 hover:bg-white/[0.05]"
                style={{ ["--salon-i" as string]: index + 1 }}
              >
                <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10">
                  <Icon className="h-5 w-5 text-amber-200" strokeWidth={1.5} />
                </span>
                <span className="block text-base font-semibold text-white/90 group-hover:text-white">
                  {tool.title}
                </span>
                <span className="mt-1 block text-sm leading-snug text-white/50">{tool.purpose}</span>
                <span className="mt-2 block text-xs text-white/35">{tool.need}</span>
                <span className="mt-3 inline-block text-sm font-medium text-amber-300/90 group-hover:text-amber-200">
                  {tool.cta} →
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
