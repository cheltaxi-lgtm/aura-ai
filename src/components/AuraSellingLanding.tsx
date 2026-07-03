"use client";

import { type ReactNode } from "react";
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
import QuickQuestions from "@/components/seo/QuickQuestions";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import OfflineSpreadBlock from "@/components/seo/OfflineSpreadBlock";
import AndroidDownloadBlock from "@/components/seo/AndroidDownloadBlock";
import LandingSeoHub from "@/components/seo/LandingSeoHub";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

const BENEFITS = [
  {
    title: "Персональный ответ",
    text: "Расклад учитывает ваш вопрос и выбранную систему — не шаблон, а диалог с символами в образе наставника.",
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
    quote: "Карты легли точно по моему вопросу, а не «вообще про любовь». Поняла, что делать дальше.",
    author: "Анна, Москва",
  },
  {
    quote: "Сначала показали расклад, и только потом — продолжение с мастером. Без навязывания, очень по-салонному.",
    author: "Елена, Санкт-Петербург",
  },
  {
    quote: "Рунический разбор с Рагнаром помог увидеть ситуацию иначе. Атмосфера — как у личного таролога.",
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
  /** Benefits, steps, directions, reviews — for guests only. */
  showSellingSections?: boolean;
  /** Slot between quick questions and selling sections (e.g. daily energy for logged-in users). */
  afterQuickQuestions?: ReactNode;
  showMasters?: boolean;
  showTariffs?: boolean;
  onOpenPaywall?: () => void;
  runeBalance?: number;
  isUnlimited?: boolean;
  onInsufficientRunes?: (payload: { balance: number; required: number }) => void;
  onOpenPhotoReading?: () => void;
  onOpenMarkCards?: () => void;
  photoNavLabel?: string;
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
  showSellingSections = true,
  afterQuickQuestions,
  showMasters = true,
  showTariffs = false,
  onOpenPaywall,
  runeBalance = 0,
  isUnlimited = false,
  onInsufficientRunes,
  onOpenPhotoReading,
  onOpenMarkCards,
  photoNavLabel,
}: AuraSellingLandingProps) {
  const { config, cost, formatRunes } = useRuneConfig();
  const { expertRegistrationEnabled } = usePlatformFeatures();

  const totalSessions = masters.reduce((sum, m) => sum + parseSessionsCount(m.sessions ?? ""), 0);
  const hasSessionStats = totalSessions > 0;

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
      const match = masters.find((m) => m.system === "numerology");
      if (match) {
        onSelectMaster(match.id);
        return;
      }
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
      {!showHero ? (
        <h1 className="sr-only">
          Zovus — персональные эзотерические консультации, расклады на таро и рунах
        </h1>
      ) : null}
      {showHero ? (
        <section className="aura-landing-hero">
          <div className="aura-landing-hero__grid mx-auto max-w-6xl">
            <motion.div
              className="aura-landing-hero__copy"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            >
              <p className="aura-landing-hero__eyebrow">Закрытый салон Таро онлайн</p>
              <h1 className="font-mystic-display aura-landing-hero__title">
                Вероника раскладывает классическое Таро под ваш вопрос
              </h1>
              <p className="aura-landing-hero__subtitle">
                Выберите ситуацию, откройте карты и продолжите разговор с мастером в личном чате.
                Zovus сохраняет контекст, историю и расшифровку без ощущения обычного AI-бота.
              </p>
              <HeroQuestionField className="mt-6" />
              <div className="aura-landing-hero__actions">
                <button type="button" onClick={handlePrimaryCta} className="btn-luxe btn-luxe--md btn-luxe--gold">
                  Открыть расклад
                </button>
                <button type="button" onClick={handleSecondaryCta} className="btn-luxe btn-luxe--md btn-luxe--ghost">
                  Посмотреть мастеров
                </button>
              </div>
              <p className="aura-landing-hero__trust">
                Вероника по умолчанию · классическое Таро · карты видны до начала сеанса
              </p>
              {config.enabled ? (
                <p className="aura-landing-hero__pricing">
                  Расклад из 3 карт и расшифровка — бесплатно ·{" "}
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
                <div className="aura-landing-hero__card aura-landing-hero__card--1">
                  <span>Его мысли</span>
                </div>
                <div className="aura-landing-hero__card aura-landing-hero__card--2">
                  <span>Его чувства</span>
                </div>
                <div className="aura-landing-hero__card aura-landing-hero__card--3">
                  <span>Совет</span>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      ) : null}

      {showHero || afterQuickQuestions ? <QuickQuestions showQuestionField={!showHero} /> : null}

      {showHero ? (
        <OfflineSpreadBlock
          onOpenPhoto={onOpenPhotoReading}
          onOpenMarkCards={onOpenMarkCards}
          photoCostLabel={photoNavLabel?.replace(/^Фото ·\s*/, "")}
        />
      ) : null}

      {afterQuickQuestions ? (
        <div className="aura-landing__after-quick">{afterQuickQuestions}</div>
      ) : null}

      {showSellingSections ? <AndroidDownloadBlock /> : null}

      {showSellingSections ? (
      <>
      <section className="aura-landing-section">
        <div className="mx-auto max-w-6xl">
          <div className="aura-landing-section__head">
            <h2 className="font-mystic-display aura-landing-section__title">Почему это ощущается как личный салон</h2>
            <p className="aura-landing-section__subtitle">
              Меньше шаблонов, больше внимания к вашему вопросу, картам и продолжению диалога.
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
            <h2 className="font-mystic-display aura-landing-section__title">Как это работает</h2>
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
      </>
      ) : null}

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

      {showSellingSections ? (
      <>
      <section className="aura-landing-section">
        <div className="mx-auto max-w-6xl">
          <div className="aura-landing-section__head">
            <h2 className="font-mystic-display aura-landing-section__title">Направления</h2>
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
          <div className="aura-landing-section__head">
            <h2 className="font-mystic-display aura-landing-section__title">Что говорят о сеансах</h2>
            <p className="aura-landing-section__subtitle">
              Карты сначала, решение потом — без навязывания и без ощущения бота.
            </p>
          </div>
          <div className="aura-landing-trust">
            <div className="aura-landing-trust__stats">
              {hasSessionStats ? (
                <div className="aura-landing-trust__stat">
                  <span className="aura-landing-trust__value">{totalSessions}+</span>
                  <span className="aura-landing-trust__label">сеансов на платформе</span>
                </div>
              ) : null}
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
                    <span className="aura-landing-review__quote-mark" aria-hidden>
                      &ldquo;
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
            <p className="mt-4 text-center text-xs text-aura-ivory/40">
              Примеры отзывов пользователей. Ответы генерируются ИИ-наставниками в художественных образах.
            </p>
          </div>
        </div>
      </section>
      </>
      ) : null}

      {showTariffs ? <LandingSeoHub /> : null}

      {showSellingSections ? (
      <section className="aura-landing-section aura-landing-section--final">
        <motion.div
          className="aura-landing-final__panel mx-auto max-w-3xl text-center"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-mystic-display aura-landing-final__title">
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
      ) : null}
    </div>
  );
}
