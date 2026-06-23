"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  Flame,
  Moon,
  Sparkles,
  Star,
  Sun,
  Zap,
} from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MastersShowcase from "@/components/MastersShowcase";
import MasterAvatar from "@/components/MasterAvatar";
import RuneIcon from "@/components/RuneIcon";
import RunePrice from "@/components/RunePrice";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

const BENEFITS = [
  {
    title: "Персональный ответ",
    text: "Расклад учитывает ваш вопрос и выбранную систему — не шаблон, а живой диалог с символами.",
    icon: Sparkles,
  },
  {
    title: "Разные школы",
    text: "Таро, руны, астрология и славянское ведовство — каждый мастер ведёт в своей традиции.",
    icon: Compass,
  },
  {
    title: "Быстрый результат",
    text: "Три символа выпадают сразу после выбора наставника — расшифровка доступна в чате.",
    icon: Zap,
  },
  {
    title: "Премиальный опыт",
    text: "Тёмная эстетика, золотые акценты и глубокая расшифровка — как закрытый эзотерический клуб.",
    icon: Moon,
  },
] as const;

const STEPS = [
  {
    num: "01",
    title: "Выберите мастера",
    text: "Каждый проводник работает в своей системе — от классического Таро до рун и звёзд.",
  },
  {
    num: "02",
    title: "Задайте вопрос",
    text: "Сформулируйте то, что важно сейчас: отношения, путь, решение или скрытый смысл.",
  },
  {
    num: "03",
    title: "Получите расшифровку",
    text: "Мастер раскроет символы в чате — с контекстом, советом и атмосферой живого сеанса.",
  },
] as const;

const DIRECTIONS = [
  {
    title: "Таро",
    text: "Классические арканы и психологический разбор — прошлое, настоящее, будущее.",
    icon: Sun,
    filter: "tarot" as const,
  },
  {
    title: "Руны",
    text: "Северная мудрость и прямой ответ — сила символов для решений и защиты.",
    icon: Flame,
    filter: "runes" as const,
  },
  {
    title: "Астрология",
    text: "Ведическая астрология и звёздные карты — карма, настоящее и путь души.",
    icon: Star,
    filter: "astrology" as const,
  },
  {
    title: "Нумерология",
    text: "Числа судьбы и циклы — когда нужен структурный взгляд на жизненный этап.",
    icon: Compass,
    filter: "numerology" as const,
  },
  {
    title: "Славянские практики",
    text: "Реза Рода и древние знаки — корни, опора и энергия рода.",
    icon: Moon,
    filter: "slavic" as const,
  },
] as const;

const TESTIMONIALS = [
  {
    quote: "Получила точный ответ и поняла, как действовать дальше.",
    author: "Анна, Москва",
  },
  {
    quote: "Очень атмосферно, будто общаешься с настоящим проводником.",
    author: "Елена, Санкт-Петербург",
  },
  {
    quote: "Рунический расклад помог посмотреть на ситуацию иначе.",
    author: "Дмитрий, Казань",
  },
] as const;

function parseTestimonialAuthor(author: string) {
  const [namePart, cityPart] = author.split(",").map((part) => part.trim());
  return {
    name: namePart || author,
    city: cityPart || "",
    initial: (namePart || author).charAt(0).toUpperCase(),
  };
}

function parseSessionsCount(sessions: string): number {
  const m = sessions.match(/(\d+)/);
  return m ? Number.parseInt(m[1], 10) : 0;
}

export interface AuraSellingLandingProps {
  isLoggedIn: boolean;
  masters: ShowcaseMaster[];
  onStartReading: () => void;
  onSelectMaster: (masterId: string) => void;
  onBrowseDeck?: (master: ShowcaseMaster) => void;
  recommendedId?: string;
  continueMasterIds?: string[];
  spreadReadingDone?: boolean;
  showHero?: boolean;
  showMasters?: boolean;
  showTariffs?: boolean;
  onOpenPaywall?: () => void;
  runeBalance?: number;
  isUnlimited?: boolean;
  onInsufficientRunes?: (payload: { balance: number; required: number }) => void;
}

export default function AuraSellingLanding({
  isLoggedIn,
  masters,
  onStartReading,
  onSelectMaster,
  onBrowseDeck,
  recommendedId,
  continueMasterIds = [],
  spreadReadingDone = false,
  showHero = true,
  showMasters = true,
  showTariffs = false,
  onOpenPaywall,
  runeBalance = 0,
  isUnlimited = false,
  onInsufficientRunes,
}: AuraSellingLandingProps) {
  const { config, cost, formatRunes } = useRuneConfig();
  const { expertRegistrationEnabled } = usePlatformFeatures();

  const totalSessions = masters.reduce((sum, m) => sum + parseSessionsCount(m.sessions), 0);
  const avgRating =
    masters.length > 0
      ? (masters.reduce((sum, m) => sum + m.rating, 0) / masters.length).toFixed(1)
      : "4.9";

  const featuredMasters = masters.slice(0, 3);

  const scrollToMasters = () => {
    document.getElementById("наставники")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePrimaryCta = () => {
    if (isLoggedIn) {
      onStartReading();
      return;
    }
    window.location.href = "/auth/user/register?returnTo=/#наставники";
  };

  const handleSecondaryCta = () => {
    scrollToMasters();
  };

  const handleDirection = (filter: (typeof DIRECTIONS)[number]["filter"]) => {
    if (filter === "numerology") {
      scrollToMasters();
      return;
    }
    const match =
      filter === "tarot"
        ? masters.find((m) => m.system?.includes("tarot") || /таро/i.test(m.title))
        : filter === "runes"
          ? masters.find((m) => m.system === "runes")
          : filter === "astrology"
            ? masters.find((m) => m.system === "astrology")
            : masters.find((m) => m.system === "slavic");
    if (match) {
      onSelectMaster(match.id);
    } else {
      scrollToMasters();
    }
  };

  return (
    <div className="aura-landing">
      {showHero ? (
        <section className="aura-landing-hero">
          <div className="aura-landing-hero__grid mx-auto max-w-6xl">
            <motion.div
              className="aura-landing-hero__copy"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="aura-landing-hero__eyebrow">Эзотерический оракул Zovus</p>
              <h1 className="font-display aura-landing-hero__title">
                Персональный расклад по{" "}
                <span className="lux-heading-accent">Таро, рунам и звёздам</span>
              </h1>
              <p className="aura-landing-hero__subtitle">
                Выберите мастера, задайте вопрос и получите глубокую расшифровку уже сейчас.
              </p>
              <div className="aura-landing-hero__actions">
                <button type="button" onClick={handlePrimaryCta} className="btn-primary px-8 py-3.5 text-sm sm:text-base">
                  Получить расклад
                </button>
                <button type="button" onClick={handleSecondaryCta} className="btn-ghost px-8 py-3.5 text-sm">
                  Выбрать мастера
                </button>
              </div>
              <p className="aura-landing-hero__trust">
                Персональные мастера · глубокие ответы · история сеансов
              </p>
              {config.enabled ? (
                <p className="aura-landing-hero__pricing">
                  Расклад из 3 карт бесплатно · расшифровка {formatRunes(cost("READING"))} ·{" "}
                  {config.freeQuestions} вопроса бесплатно
                </p>
              ) : null}
            </motion.div>

            <motion.div
              className="aura-landing-hero__visual"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            >
              <div className="aura-landing-hero__orb" />
              <div className="aura-landing-hero__ring aura-landing-hero__ring--outer" />
              <div className="aura-landing-hero__ring aura-landing-hero__ring--inner" />
              <div className="aura-landing-hero__portraits">
                {featuredMasters.map((m, i) => (
                  <div
                    key={m.id}
                    className={`aura-landing-hero__portrait aura-landing-hero__portrait--${i}`}
                  >
                    <MasterAvatar masterId={m.id} masterName={m.name} size="md" priority />
                  </div>
                ))}
              </div>
              <div className="aura-landing-hero__cards">
                <div className="aura-landing-hero__card aura-landing-hero__card--1" />
                <div className="aura-landing-hero__card aura-landing-hero__card--2" />
                <div className="aura-landing-hero__card aura-landing-hero__card--3" />
              </div>
            </motion.div>
          </div>
        </section>
      ) : null}

      <section className="aura-landing-section">
        <div className="mx-auto max-w-6xl">
          <div className="aura-landing-section__head">
            <h2 className="font-display aura-landing-section__title">Почему Zovus</h2>
            <p className="aura-landing-section__subtitle">
              Не просто карты — персональный канал к символам, которые говорят на вашем языке.
            </p>
          </div>
          <div className="aura-landing-benefits">
            {BENEFITS.map((item, i) => (
              <motion.article
                key={item.title}
                className="aura-landing-benefit glass-panel"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08, duration: 0.45 }}
              >
                <div className="aura-landing-benefit__icon">
                  <item.icon className="h-5 w-5 text-aura-champagne" strokeWidth={1.5} />
                </div>
                <h3 className="font-display aura-landing-benefit__title">{item.title}</h3>
                <p className="aura-landing-benefit__text">{item.text}</p>
              </motion.article>
            ))}
          </div>
        </div>
      </section>

      <section className="aura-landing-section">
        <div className="mx-auto max-w-6xl">
          <div className="aura-landing-section__head">
            <h2 className="font-display aura-landing-section__title">Как это работает</h2>
            <p className="aura-landing-section__subtitle">Три шага от вопроса до ясности</p>
          </div>
          <div className="aura-landing-steps">
            {STEPS.map((step, i) => (
              <motion.div
                key={step.num}
                className="aura-landing-step glass-panel"
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45 }}
              >
                <span className="aura-landing-step__num">{step.num}</span>
                <h3 className="font-display aura-landing-step__title">{step.title}</h3>
                <p className="aura-landing-step__text">{step.text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {showMasters ? (
        <MastersShowcase
          masters={masters}
          onSelect={onSelectMaster}
          onBrowseDeck={onBrowseDeck}
          recommendedId={recommendedId}
          continueMasterIds={continueMasterIds}
          spreadReadingDone={spreadReadingDone}
          runesEnabled={config.enabled}
          readingCost={config.enabled ? cost("READING") : undefined}
          questionCost={config.enabled ? cost("QUESTION") : undefined}
          formatRunes={formatRunes}
          runeBalance={runeBalance}
          isUnlimited={isUnlimited}
          onInsufficientRunes={(payload) => {
            onInsufficientRunes?.(payload);
            onOpenPaywall?.();
          }}
          layout="grid"
          title="Выберите своего проводника"
          subtitle="Каждый мастер работает в своей системе — от классического Таро до рун и астрологии."
          showExpertCta={expertRegistrationEnabled}
          className="aura-landing-masters"
        />
      ) : null}

      <section className="aura-landing-section">
        <div className="mx-auto max-w-6xl">
          <div className="aura-landing-section__head">
            <h2 className="font-display aura-landing-section__title">Направления</h2>
            <p className="aura-landing-section__subtitle">
              Выберите систему, которая откликается — или доверьтесь мастеру.
            </p>
          </div>
          <div className="aura-landing-directions">
            {DIRECTIONS.map((dir, i) => (
              <motion.button
                key={dir.title}
                type="button"
                onClick={() => handleDirection(dir.filter)}
                className="aura-landing-direction glass-panel text-left"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.06, duration: 0.4 }}
              >
                <dir.icon className="mb-3 h-5 w-5 text-aura-champagne/80" strokeWidth={1.5} />
                <h3 className="font-display text-base font-semibold text-white">{dir.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-aura-ivory/60">{dir.text}</p>
                <span className="aura-landing-direction__link">
                  К мастерам
                  <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      <section className="aura-landing-section aura-landing-section--trust">
        <div className="mx-auto max-w-6xl">
          <div className="aura-landing-trust">
            <div className="aura-landing-trust__stats">
              <div className="aura-landing-trust__stat">
                <span className="aura-landing-trust__value">
                  {totalSessions > 0 ? `${totalSessions}+` : "1000+"}
                </span>
                <span className="aura-landing-trust__label">сеансов на платформе</span>
              </div>
              <div className="aura-landing-trust__stat">
                <span className="aura-landing-trust__value">{avgRating}</span>
                <span className="aura-landing-trust__label">средняя оценка мастеров</span>
              </div>
              <div className="aura-landing-trust__stat">
                <span className="aura-landing-trust__value">{masters.length}</span>
                <span className="aura-landing-trust__label">проводников в витрине</span>
              </div>
            </div>

            <div className="aura-landing-trust__quotes">
              {TESTIMONIALS.map((t) => {
                const author = parseTestimonialAuthor(t.author);
                return (
                  <article key={t.author} className="aura-landing-review">
                    <div className="aura-landing-review__stars" aria-hidden>
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className="aura-landing-review__star" fill="currentColor" />
                      ))}
                    </div>
                    <span className="aura-landing-review__quote-mark" aria-hidden>
                      "
                    </span>
                    <p className="aura-landing-review__text">{t.quote}</p>
                    <footer className="aura-landing-review__footer">
                      <span className="aura-landing-review__avatar">{author.initial}</span>
                      <div className="aura-landing-review__author-meta">
                        <span className="aura-landing-review__name">{author.name}</span>
                        {author.city ? (
                          <span className="aura-landing-review__city">{author.city}</span>
                        ) : null}
                      </div>
                    </footer>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {showTariffs ? (
        <section id="тарифы" className="aura-landing-section aura-landing-section--tariffs">
          <div className="mx-auto max-w-6xl text-center">
            <h2 className="font-display aura-landing-section__title aura-landing-tariffs__title">
              {config.enabled ? (
                <>
                  Оплата рунами
                  <RuneIcon className="aura-landing-tariffs__title-icon" title="Руны" />
                </>
              ) : (
                "Тарифы"
              )}
            </h2>

            {config.enabled ? (
              <div className="aura-landing-tariffs__grid">
                <article className="aura-landing-tariff-card">
                  <RuneIcon className="aura-landing-tariff-card__icon" />
                  <p className="aura-landing-tariff-card__price">
                    <RunePrice value={cost("READING")} iconClassName="h-4 w-4" />
                  </p>
                  <p className="aura-landing-tariff-card__label">Расшифрование</p>
                  <p className="aura-landing-tariff-card__hint">полный разбор расклада</p>
                </article>
                <article className="aura-landing-tariff-card">
                  <RuneIcon className="aura-landing-tariff-card__icon" />
                  <p className="aura-landing-tariff-card__price">
                    <RunePrice value={cost("QUESTION")} iconClassName="h-4 w-4" />
                  </p>
                  <p className="aura-landing-tariff-card__label">Доп. вопрос</p>
                  <p className="aura-landing-tariff-card__hint">после бесплатных</p>
                </article>
                <article className="aura-landing-tariff-card aura-landing-tariff-card--free">
                  <RuneIcon className="aura-landing-tariff-card__icon" />
                  <p className="aura-landing-tariff-card__price aura-landing-tariff-card__price--free">
                    Бесплатно
                  </p>
                  <p className="aura-landing-tariff-card__label">
                    Первые {config.freeQuestions} вопроса
                  </p>
                  <p className="aura-landing-tariff-card__hint">в каждом сеансе</p>
                </article>
              </div>
            ) : (
              <p className="aura-landing-tariffs__fallback">
                Полный разбор — 199 ₽ · подписка Zovus+ — 590 ₽/мес
              </p>
            )}

            <button
              type="button"
              onClick={() => {
                if (isLoggedIn && onOpenPaywall) onOpenPaywall();
                else handlePrimaryCta();
              }}
              className="aura-landing-btn aura-landing-btn--secondary"
            >
              {isLoggedIn ? "Пополнить баланс" : "Начать бесплатно"}
            </button>
          </div>
        </section>
      ) : null}

      <section className="aura-landing-section aura-landing-section--final">
        <motion.div
          className="aura-landing-final__panel mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-display aura-landing-final__title">
            Задайте вопрос — и получите свой расклад
          </h2>
          <p className="aura-landing-final__text">
            Выберите мастера и откройте подсказку, которая нужна вам сейчас.
          </p>
          <button type="button" onClick={handlePrimaryCta} className="aura-landing-btn aura-landing-btn--primary">
            Начать расклад
            <ArrowRight className="h-4 w-4" />
          </button>
          {!isLoggedIn ? (
            <p className="aura-landing-final__login">
              Уже есть аккаунт?{" "}
              <Link href="/auth/user/login?returnTo=/" className="aura-landing-final__login-link">
                Войти
              </Link>
            </p>
          ) : null}
        </motion.div>
      </section>
    </div>
  );
}
