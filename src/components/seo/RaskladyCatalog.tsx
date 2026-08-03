"use client";



import Link from "next/link";

import { type MouseEvent, useEffect, useMemo, useState } from "react";

import {
  getAllSpreadIntents,
  getFeaturedSpreadIntents,
  getSpreadIntentBySlug,
  SPREAD_INTENT_CATEGORY_LABELS,
  type SpreadIntentCategory,
  type SpreadIntentDefinition,
} from "@/lib/spread-intents";

import { resolveIntentCopy, type UserGender } from "@/lib/spread-intents/gender-copy";

import { estimateIntentRuneCost } from "@/lib/spread-intents/router";
import { buildIntentSeoUrl, navigateToUrl } from "@/lib/spread-intents/router";

import { getSpread } from "@/lib/spreads";

import { getCharacterById } from "@/lib/characters";

import { readStoredProfile } from "@/lib/home-flow-storage";



const CATEGORY_ORDER: SpreadIntentCategory[] = [

  "love",

  "money",

  "career",

  "future",

  "self",

  "choice",

  "family",

  "ritual",

];



type CardCountFilter = "all" | "1" | "3" | "5" | "7+";

const HERO_INTENT_SLUGS = ["god-vpered", "sovmestimost-12", "lenormand-liniya"] as const;

const goToIntent =
  (href: string) =>
  (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateToUrl(href);
  };

function IntentCard({

  intent,

  userGender,

}: {

  intent: SpreadIntentDefinition;

  userGender: UserGender;

}) {

  const copy = resolveIntentCopy(intent, userGender);

  const master = getCharacterById(intent.recommendedMasterId);

  const spread = getSpread(intent.spreadId);
  const href = buildIntentSeoUrl(intent);

  return (
    <a
      href={href}
      onClick={goToIntent(href)}
      className="rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/30 hover:bg-white/[0.07]"
    >

      <p className="font-medium text-white">{copy.title}</p>

      <p className="mt-1 line-clamp-2 text-sm text-white/55">{copy.intro}</p>

      <p className="mt-3 text-xs text-white/40">

        {master?.name ?? intent.recommendedMasterId} · {spread.label} · от{" "}

        {estimateIntentRuneCost(intent.spreadId)} ᚢ

      </p>
    </a>
  );
}



function matchesCardCount(spreadId: SpreadIntentDefinition["spreadId"], filter: CardCountFilter): boolean {

  if (filter === "all") return true;

  const count = getSpread(spreadId).cardCount;

  if (filter === "7+") return count >= 7;

  return count === Number(filter);

}



export default function RaskladyCatalog() {

  const [userGender, setUserGender] = useState<UserGender>(null);

  const [categoryFilter, setCategoryFilter] = useState<SpreadIntentCategory | "all">("all");

  const [cardFilter, setCardFilter] = useState<CardCountFilter>("all");

  const [query, setQuery] = useState("");



  useEffect(() => {

    const gender = readStoredProfile()?.gender;

    setUserGender(gender === "male" || gender === "female" ? gender : null);

  }, []);



  const featured = useMemo(() => getFeaturedSpreadIntents(6), []);

  const heroIntents = useMemo(
    () =>
      HERO_INTENT_SLUGS.map((slug) => getSpreadIntentBySlug(slug)).filter(
        (i): i is SpreadIntentDefinition => Boolean(i)
      ),
    []
  );

  const all = useMemo(() => getAllSpreadIntents(), []);



  const filtered = useMemo(() => {

    const q = query.trim().toLowerCase();

    return all.filter((intent) => {

      if (categoryFilter !== "all" && intent.category !== categoryFilter) return false;

      if (!matchesCardCount(intent.spreadId, cardFilter)) return false;

      if (!q) return true;

      const haystack = `${intent.title} ${intent.intro} ${intent.questionTemplate}`.toLowerCase();

      return haystack.includes(q);

    });

  }, [all, categoryFilter, cardFilter, query]);



  const featuredSlugs = useMemo(() => new Set(featured.map((i) => i.slug)), [featured]);

  const showGrouped = categoryFilter === "all" && !query.trim() && cardFilter === "all";



  return (

    <>

      {showGrouped && heroIntents.length > 0 ? (
        <section className="mt-8">
          <h2 className="font-display text-lg text-aura-gold">Глубокие расклады</h2>
          <p className="mt-1 text-sm text-white/50">
            Год вперёд, совместимость на 12 карт и линия Ленорман — флагманские схемы Zovus.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {heroIntents.map((intent) => {
              const href = buildIntentSeoUrl(intent);
              return (
              <a
                key={intent.slug}
                href={href}
                onClick={goToIntent(href)}
                className="rounded-2xl border border-aura-gold/25 bg-gradient-to-br from-aura-gold/10 to-white/[0.03] p-5 transition hover:border-aura-gold/45"
              >
                <p className="font-display text-base text-white">
                  {resolveIntentCopy(intent, userGender).title}
                </p>
                <p className="mt-2 line-clamp-2 text-sm text-white/55">
                  {resolveIntentCopy(intent, userGender).intro}
                </p>
                <p className="mt-3 text-xs text-aura-gold/80">
                  {getSpread(intent.spreadId).label} · {getSpread(intent.spreadId).cardCount} карт
                </p>
              </a>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="rasklady-filters mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-4">

        <div className="flex flex-wrap gap-2">

          <button

            type="button"

            onClick={() => setCategoryFilter("all")}

            className={`rasklady-filters__chip${categoryFilter === "all" ? " rasklady-filters__chip--active" : ""}`}

          >

            Все темы

          </button>

          {CATEGORY_ORDER.map((category) => (

            <button

              key={category}

              type="button"

              onClick={() => setCategoryFilter(category)}

              className={`rasklady-filters__chip${categoryFilter === category ? " rasklady-filters__chip--active" : ""}`}

            >

              {SPREAD_INTENT_CATEGORY_LABELS[category]}

            </button>

          ))}

        </div>

        <div className="mt-3 flex flex-wrap gap-2">

          {(["all", "1", "3", "5", "7+"] as CardCountFilter[]).map((value) => (

            <button

              key={value}

              type="button"

              onClick={() => setCardFilter(value)}

              className={`rasklady-filters__chip rasklady-filters__chip--sm${cardFilter === value ? " rasklady-filters__chip--active" : ""}`}

            >

              {value === "all" ? "Любое число карт" : `${value} карт`}

            </button>

          ))}

        </div>

        <input

          type="search"

          value={query}

          onChange={(e) => setQuery(e.target.value)}

          placeholder="Поиск по названию или вопросу…"

          className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white placeholder:text-white/35"

        />

        <div className="mt-3 flex flex-wrap gap-2 text-xs">

          <Link href="/photo-rasklad" className="text-aura-gold hover:underline">

            Фото-расклад / расшифровка по фото

          </Link>

        </div>

      </section>



      {showGrouped ? (

        <section className="mt-10">

          <h2 className="font-display text-lg text-aura-gold">Популярное</h2>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">

            {featured.map((intent) => (

              <IntentCard key={intent.slug} intent={intent} userGender={userGender} />

            ))}

          </div>

        </section>

      ) : null}



      {showGrouped

        ? CATEGORY_ORDER.map((category) => {

            const items = filtered.filter(

              (i) => i.category === category && !featuredSlugs.has(i.slug)

            );

            if (items.length === 0) return null;

            return (

              <section key={category} className="mt-10">

                <h2 className="font-display text-lg text-aura-gold">

                  {SPREAD_INTENT_CATEGORY_LABELS[category]}

                </h2>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">

                  {items.map((intent) => (

                    <IntentCard key={intent.slug} intent={intent} userGender={userGender} />

                  ))}

                </div>

              </section>

            );

          })

        : (

          <section className="mt-10">

            <h2 className="font-display text-lg text-aura-gold">

              {filtered.length} расклад{filtered.length === 1 ? "" : filtered.length < 5 ? "а" : "ов"}

            </h2>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">

              {filtered.map((intent) => (

                <IntentCard key={intent.slug} intent={intent} userGender={userGender} />

              ))}

            </div>

          </section>

        )}

    </>

  );

}

