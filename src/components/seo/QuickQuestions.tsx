"use client";

import Link from "next/link";
import { getFeaturedSpreadIntents } from "@/lib/spread-intents";
import { trackQuickQuestionClick } from "@/lib/seo/metrika";

const QUICK_LINKS = [
  { label: "Что он чувствует?", slug: "chto-on-chuvstvuet" },
  { label: "Вернётся ли он?", slug: "vernyotsya-li-on" },
  { label: "Что я упускаю?", slug: "chto-so-mnoy-proiskhodit" },
  { label: "Стоит ли менять работу?", slug: "stoit-li-menyat-rabotu" },
  { label: "Куда уходят деньги?", slug: "kuda-ukhodyat-dengi" },
  { label: "Что меня ждёт?", slug: "blizhayshee-budushchee" },
  { label: "Нужна ли защита?", slug: "nuzhna-li-zashchita" },
  { label: "Как отпустить человека?", slug: "kak-otpustit-cheloveka" },
] as const;

export default function QuickQuestions() {
  const featured = getFeaturedSpreadIntents(4);

  return (
    <section className="mx-auto mt-10 max-w-4xl px-4 sm:mt-14">
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.2em] text-aura-gold/80">Быстрый старт</p>
        <h2 className="mt-2 font-display text-2xl font-semibold text-white">С чего начнём?</h2>
        <p className="mt-2 text-sm text-white/60">
          Выбери вопрос — мы подберём мастера и расклад.
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {QUICK_LINKS.map((item) => (
            <Link
              key={item.slug}
              href={`/rasklady/${item.slug}`}
              onClick={() => trackQuickQuestionClick(item.slug)}
              className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white/85 transition hover:border-aura-gold/40 hover:bg-aura-gold/10 hover:text-white"
            >
              {item.label}
            </Link>
          ))}
        </div>
        {featured.length > 0 ? (
          <p className="mt-5 text-xs text-white/40">
            Популярное:{" "}
            {featured.map((item, i) => (
              <span key={item.slug}>
                {i > 0 ? " · " : ""}
                <Link href={`/rasklady/${item.slug}`} className="text-aura-gold/80 hover:text-aura-gold">
                  {item.title}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}
