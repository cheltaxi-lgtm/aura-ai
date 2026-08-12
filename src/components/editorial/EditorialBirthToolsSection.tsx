"use client";

import Link from "next/link";
import { Sparkles, Sun } from "lucide-react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

/** Guest landing: birth-data tools (Матрица судьбы + Дизайн Человека) near the top. */
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
          Расчёты по дате рождения
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href="/numerology/destiny-matrix"
            className="salon-reveal__item group block rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-amber-300/40 hover:bg-white/[0.05]"
            style={{ ["--salon-i" as string]: 1 }}
          >
            <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10">
              <Sparkles className="h-5 w-5 text-amber-200" strokeWidth={1.5} />
            </span>
            <span className="block text-base font-semibold text-white/90 group-hover:text-white">
              Матрица судьбы
            </span>
            <span className="mt-1 block text-sm leading-snug text-white/50">
              22 энергии по дате рождения: предназначение, таланты, задачи души.
            </span>
            <span className="mt-3 inline-block text-sm font-medium text-amber-300/90 group-hover:text-amber-200">
              Рассчитать →
            </span>
          </Link>
          {humanDesignEnabled ? (
            <Link
              href="/dizayn-cheloveka/rasschitat"
              className="salon-reveal__item group block rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition hover:border-amber-300/40 hover:bg-white/[0.05]"
              style={{ ["--salon-i" as string]: 2 }}
            >
              <span className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full border border-amber-300/30 bg-amber-300/10">
                <Sun className="h-5 w-5 text-amber-200" strokeWidth={1.5} />
              </span>
              <span className="block text-base font-semibold text-white/90 group-hover:text-white">
                Дизайн Человека
              </span>
              <span className="mt-1 block text-sm leading-snug text-white/50">
                Бодиграф по дате, времени и городу: тип, стратегия, авторитет, 9 центров.
              </span>
              <span className="mt-3 inline-block text-sm font-medium text-amber-300/90 group-hover:text-amber-200">
                Рассчитать бодиграф →
              </span>
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
