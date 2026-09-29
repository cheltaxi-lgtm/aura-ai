"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowUpRight, Camera, Search, Sparkles, Sun } from "lucide-react";
import {
  getAllSpreadIntents,
  getSpreadIntentBySlug,
  SPREAD_INTENT_CATEGORY_LABELS,
  type SpreadIntentCategory,
  type SpreadIntentDefinition,
} from "@/lib/spread-intents";
import { resolveIntentCopy, type UserGender } from "@/lib/spread-intents/gender-copy";
import { buildIntentSeoUrl } from "@/lib/spread-intents/router";
import { getSpread, isDailyOnlySpread } from "@/lib/spreads";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { useSpreadPrices } from "@/lib/useSpreadPrices";

const CATEGORY_ORDER: SpreadIntentCategory[] = [
  "love", "money", "career", "future", "self", "choice", "family", "ritual",
];

const CATEGORY_COPY: Record<SpreadIntentCategory, string> = {
  love: "Чувства, доверие и развитие отношений",
  money: "Ресурсы, возможности и денежные решения",
  career: "Работа, направление и следующий шаг",
  future: "Ближайшие события и длинный горизонт",
  self: "Внутреннее состояние и личный путь",
  choice: "Когда важно увидеть оба варианта",
  family: "Близкие люди и семейные связи",
  ritual: "Энергия, защита и обновление",
};

const HERO_INTENT_SLUGS = ["god-vpered", "sovmestimost-12", "lenormand-liniya"] as const;
const CARD_FILTERS = ["all", "1", "3", "5", "7+"] as const;
type CardCountFilter = (typeof CARD_FILTERS)[number];
const RESULTS_PAGE_SIZE = 24;

function normalizeSearch(value: string): string {
  return value.toLocaleLowerCase("ru").replaceAll("ё", "е").replace(/\s+/g, " ").trim();
}

function matchesCardCount(intent: SpreadIntentDefinition, filter: CardCountFilter): boolean {
  if (filter === "all") return true;
  const count = getSpread(intent.spreadId).cardCount;
  return filter === "7+" ? count >= 7 : count === Number(filter);
}

function cardCountLabel(filter: CardCountFilter): string {
  if (filter === "all") return "Любое число карт";
  if (filter === "1") return "1 карта";
  if (filter === "3") return "3 карты";
  return `${filter} карт`;
}

function IntentCard({
  intent,
  userGender,
  prices,
  variant = "standard",
}: {
  intent: SpreadIntentDefinition;
  userGender: UserGender;
  prices: Record<string, number> | null;
  variant?: "standard" | "deep";
}) {
  const copy = resolveIntentCopy(intent, userGender);
  const spread = getSpread(intent.spreadId);
  const runeCost = prices?.[intent.spreadId];
  const priceLabel = runeCost === undefined ? "стоимость уточним перед началом" : `от ${runeCost} рун`;

  return (
    <Link
      href={buildIntentSeoUrl(intent)}
      className={`rasklady-card rasklady-card--${variant}`}
      aria-label={`${copy.title}, ${spread.cardCount} карт, ${priceLabel}`}
    >
      <span className="rasklady-card__ornament" aria-hidden="true">✦</span>
      <span className="rasklady-card__topline">
        <span>{variant === "deep" ? "Глубокий расклад" : SPREAD_INTENT_CATEGORY_LABELS[intent.category]}</span>
        <span>{spread.cardCount} карт</span>
      </span>
      <strong className="rasklady-card__title">{copy.title}</strong>
      <span className="rasklady-card__intro">{copy.intro}</span>
      <span className="rasklady-card__bottomline">
        <span>{runeCost === undefined ? "Стоимость перед началом" : `от ${runeCost} ᚢ`}</span>
        <span className="rasklady-card__action">Подробнее <ArrowUpRight size={15} aria-hidden="true" /></span>
      </span>
    </Link>
  );
}

export default function RaskladyCatalog() {
  const prices = useSpreadPrices();
  const [userGender, setUserGender] = useState<UserGender>(null);
  const [categoryFilter, setCategoryFilter] = useState<SpreadIntentCategory | "all">("all");
  const [cardFilter, setCardFilter] = useState<CardCountFilter>("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(RESULTS_PAGE_SIZE);

  useEffect(() => {
    const gender = readStoredProfile()?.gender;
    setUserGender(gender === "male" || gender === "female" ? gender : null);
  }, []);

  const all = useMemo(() => getAllSpreadIntents().filter((intent) => !isDailyOnlySpread(intent.spreadId) && intent.slug !== "karta-dnya"), []);
  const featured = useMemo(() => all.filter((intent) => intent.isFeatured).slice(0, 6), [all]);
  const deep = useMemo(
    () => HERO_INTENT_SLUGS.map(getSpreadIntentBySlug).filter((item): item is SpreadIntentDefinition => Boolean(item)),
    []
  );
  const curatedSlugs = useMemo(() => new Set([...featured, ...deep].map((item) => item.slug)), [featured, deep]);
  const categoryCounts = useMemo(
    () => Object.fromEntries(CATEGORY_ORDER.map((category) => [category, all.filter((item) => item.category === category).length])) as Record<SpreadIntentCategory, number>,
    [all]
  );

  const filtered = useMemo(() => {
    const normalized = normalizeSearch(query);
    return all.filter((intent) => {
      if (categoryFilter !== "all" && intent.category !== categoryFilter) return false;
      if (!matchesCardCount(intent, cardFilter)) return false;
      if (!normalized) return true;
      const haystack = normalizeSearch(`${intent.title} ${intent.intro} ${intent.questionTemplate}`);
      return haystack.includes(normalized);
    });
  }, [all, categoryFilter, cardFilter, query]);

  const showGrouped = categoryFilter === "all" && cardFilter === "all" && !query.trim();
  const resetFilters = () => {
    setCategoryFilter("all");
    setCardFilter("all");
    setQuery("");
    setVisibleCount(RESULTS_PAGE_SIZE);
  };

  return (
    <div className="rasklady-premium">
      <div className="rasklady-hero">
        <div className="rasklady-hero__copy">
          <p className="rasklady-eyebrow"><Sparkles size={14} aria-hidden="true" /> Ваш вопрос · Ваш расклад</p>
          <h1>Каталог раскладов <em>Таро онлайн</em></h1>
          <p className="rasklady-hero__lead">
            Выберите готовый вопрос или тему. Покажем подходящую схему, а затем вы сможете открыть карты с наставником.
          </p>
          <p className="rasklady-hero__price-note">Тематические расклады оплачиваются рунами. Стоимость каждого видна до начала.</p>
        </div>

        <section className="rasklady-finder" aria-label="Найти расклад">
          <div className="rasklady-finder__heading">
            <span>Найдите свой вопрос</span>
            <span className="rasklady-finder__index">01 / ВЫБОР</span>
          </div>
          <label className="rasklady-finder__search" htmlFor="rasklady-search">
            <Search size={19} aria-hidden="true" />
            <input
              id="rasklady-search"
              type="search"
              aria-label="Поиск расклада"
              value={query}
              onChange={(event) => { setQuery(event.target.value); setVisibleCount(RESULTS_PAGE_SIZE); }}
              placeholder="Например, отношения или работа"
              autoComplete="off"
            />
          </label>
          <div className="rasklady-finder__group" role="group" aria-label="Тема расклада">
            <p>Тема</p>
            <div className="rasklady-finder__chips">
              <button type="button" aria-pressed={categoryFilter === "all"} onClick={() => { setCategoryFilter("all"); setVisibleCount(RESULTS_PAGE_SIZE); }}>Все темы</button>
              {CATEGORY_ORDER.map((category) => (
                <button key={category} type="button" aria-pressed={categoryFilter === category} onClick={() => { setCategoryFilter(category); setVisibleCount(RESULTS_PAGE_SIZE); }}>
                  {SPREAD_INTENT_CATEGORY_LABELS[category]}
                </button>
              ))}
            </div>
          </div>
          <div className="rasklady-finder__group" role="group" aria-label="Число карт">
            <p>Число карт</p>
            <div className="rasklady-finder__chips rasklady-finder__chips--cards">
              {CARD_FILTERS.map((filter) => (
                <button key={filter} type="button" aria-pressed={cardFilter === filter} onClick={() => { setCardFilter(filter); setVisibleCount(RESULTS_PAGE_SIZE); }}>
                  {cardCountLabel(filter)}
                </button>
              ))}
            </div>
          </div>
          <div className="rasklady-finder__footer">
            <Link href="/photo-rasklad"><Camera size={16} aria-hidden="true" /> Уже разложили карты? Разобрать фото</Link>
            {!showGrouped ? <button type="button" onClick={resetFilters}>Сбросить</button> : null}
          </div>
        </section>
        <Link href="/?daily=1" className="rasklady-daily">
          <span className="rasklady-daily__icon"><Sun size={22} aria-hidden="true" /></span>
          <span><strong>Бесплатный расклад на сутки</strong><small>Отдельный ежедневный ритуал: утро, день и вечер. Один раз в сутки после входа.</small></span>
          <ArrowUpRight size={19} aria-hidden="true" />
        </Link>
      </div>

      {showGrouped ? (
        <>
          <section className="rasklady-section" aria-labelledby="rasklady-deep-title">
            <div className="rasklady-section__heading">
              <div><p className="rasklady-eyebrow">Погрузиться глубже</p><h2 id="rasklady-deep-title">Глубокие расклады</h2></div>
              <p>Большие схемы для важных тем. Состав и стоимость видны до начала.</p>
            </div>
            <div className="rasklady-grid rasklady-grid--deep">
              {deep.map((intent) => <IntentCard key={intent.slug} intent={intent} userGender={userGender} prices={prices} variant="deep" />)}
            </div>
          </section>

          <section className="rasklady-section" aria-labelledby="rasklady-featured-title">
            <div className="rasklady-section__heading">
              <div><p className="rasklady-eyebrow">С чего начать</p><h2 id="rasklady-featured-title">Популярное</h2></div>
              <p>Готовые вопросы, с которыми проще выбрать первую схему.</p>
            </div>
            <div className="rasklady-grid">
              {featured.map((intent) => <IntentCard key={intent.slug} intent={intent} userGender={userGender} prices={prices} />)}
            </div>
          </section>

          <section className="rasklady-section rasklady-section--topics" aria-labelledby="rasklady-topics-title">
            <div className="rasklady-section__heading">
              <div><p className="rasklady-eyebrow">Исследовать по теме</p><h2 id="rasklady-topics-title">Все направления</h2></div>
              <p>Откройте близкую тему и посмотрите вопросы внутри.</p>
            </div>
            <div className="rasklady-topics">
              {CATEGORY_ORDER.map((category, index) => {
                const items = all.filter((item) => item.category === category && !curatedSlugs.has(item.slug));
                if (items.length === 0) return null;
                return (
                  <details className="rasklady-topic" key={category}>
                    <summary>
                      <span className="rasklady-topic__number">0{index + 1}</span>
                      <span className="rasklady-topic__main"><strong>{SPREAD_INTENT_CATEGORY_LABELS[category]}</strong><small>{CATEGORY_COPY[category]}</small></span>
                      <span className="rasklady-topic__count">{categoryCounts[category]} вопросов</span>
                      <ArrowRight size={18} aria-hidden="true" />
                    </summary>
                    <div className="rasklady-topic__content">
                      <div className="rasklady-topic__links">
                        {items.map((intent) => <Link key={intent.slug} href={buildIntentSeoUrl(intent)}>{resolveIntentCopy(intent, userGender).title}<ArrowUpRight size={14} aria-hidden="true" /></Link>)}
                      </div>
                    </div>
                  </details>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <section className="rasklady-section rasklady-section--results" id="rasklady-results" aria-labelledby="rasklady-results-title">
          <div className="rasklady-section__heading">
            <div><p className="rasklady-eyebrow">Ваш выбор</p><h2 id="rasklady-results-title">Найдено: {filtered.length}</h2></div>
            <p aria-live="polite">{filtered.length ? "Выберите вопрос, чтобы посмотреть схему и цену." : "Попробуйте другую тему или более короткий запрос."}</p>
          </div>
          {filtered.length ? (
            <>
              <div className="rasklady-grid">
                {filtered.slice(0, visibleCount).map((intent) => <IntentCard key={intent.slug} intent={intent} userGender={userGender} prices={prices} />)}
              </div>
              {filtered.length > visibleCount ? (
                <button className="rasklady-show-more" type="button" onClick={() => setVisibleCount((count) => count + RESULTS_PAGE_SIZE)}>
                  Показать ещё · {filtered.length - visibleCount} <ArrowRight size={17} aria-hidden="true" />
                </button>
              ) : null}
            </>
          ) : <button className="rasklady-show-more" type="button" onClick={resetFilters}>Показать все расклады <ArrowRight size={17} aria-hidden="true" /></button>}
        </section>
      )}

      <div className="rasklady-footer-note">
        <span aria-hidden="true">✧</span>
        <p>Не нашли нужный вопрос? <Link href="/">Задайте свой мастеру</Link> — начните с главной страницы.</p>
      </div>
    </div>
  );
}
