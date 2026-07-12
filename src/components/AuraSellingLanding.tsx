"use client";

import { type ReactNode, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Compass,
  Flame,
  Lock,
  Moon,
  Shield,
  Sparkles,
  Star,
  Sun,
  Zap,
} from "lucide-react";
import type { ShowcaseMaster } from "@/lib/showcase-masters";
import MastersShowcase from "@/components/MastersShowcase";
import LandingHeroVisual from "@/components/seo/LandingHeroVisual";
import GuestTripletDraw from "@/components/GuestTripletDraw";
import QuickQuestions from "@/components/seo/QuickQuestions";
import HeroQuestionField from "@/components/seo/HeroQuestionField";
import OfflineSpreadBlock from "@/components/seo/OfflineSpreadBlock";
import AndroidDownloadBlock from "@/components/seo/AndroidDownloadBlock";
import LandingSeoHub from "@/components/seo/LandingSeoHub";
import LandingStickyCta from "@/components/seo/LandingStickyCta";
import {
  buildLandingOfferCopy,
  GUEST_SPREAD_SECTION_ID,
  GUEST_SPREAD_START_EVENT,
  LANDING_QUESTION_KEY,
  type GuestSpreadStartDetail,
} from "@/lib/landing-offer";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { trackLandingView } from "@/lib/seo/metrika";

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
    title: "Живой диалог",
    text: "После расклада можно уточнять детали в чате — мастер помнит контекст и ваш вопрос.",
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
    title: "Задайте вопрос",
    text: "Сформулируйте то, что важно сейчас: отношения, путь, решение или скрытый смысл.",
  },
  {
    num: "02",
    title: "Откройте три карты",
    text: "Выберите символы на столе — расклад формируется под ваш запрос ещё до регистрации.",
  },
  {
    num: "03",
    title: "Получите расшифровку",
    text: "Зарегистрируйтесь, чтобы сохранить расклад и продолжить сеанс с мастером в чате.",
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

const TRUST_POINTS = [
  {
    title: "ИИ-мастера в образах",
    text: "Наставники — художественные персонажи Zovus. Мы честно обозначаем это до начала сеанса.",
    icon: Sparkles,
  },
  {
    title: "Конфиденциальность",
    text: "Ваш вопрос и переписка сохраняются в личном кабинете и не публикуются.",
    icon: Lock,
  },
  {
    title: "Прозрачная оплата",
    text: "Бесплатный расклад виден заранее. Платные действия показывают цену до списания рун.",
    icon: Shield,
  },
] as const;

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
  /** Explicit "get a ritual" CTA — shown right under quick questions, no scrolling needed. */
  onOpenRitual?: () => void;
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
  onOpenRitual,
}: AuraSellingLandingProps) {
  const { config, cost, formatRunes } = useRuneConfig();
  const { expertRegistrationEnabled } = usePlatformFeatures();
  const offer = buildLandingOfferCopy(config, formatRunes);

  useEffect(() => {
    if (showHero && !isLoggedIn) trackLandingView();
  }, [showHero, isLoggedIn]);

  const totalSessions = masters.reduce((sum, m) => sum + parseSessionsCount(m.sessions ?? ""), 0);
  const hasSessionStats = totalSessions > 0;

  const scrollToMasters = () => {
    document.getElementById("наставники")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const startGuestSpread = (question?: string, masterId?: string) => {
    const normalizedQuestion = question?.trim();
    if (normalizedQuestion) {
      sessionStorage.setItem(LANDING_QUESTION_KEY, normalizedQuestion);
    }
    const detail: GuestSpreadStartDetail = {
      question: normalizedQuestion,
      masterId,
    };
    window.dispatchEvent(new CustomEvent(GUEST_SPREAD_START_EVENT, { detail }));
    document.getElementById(GUEST_SPREAD_SECTION_ID)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handlePrimaryCta = () => {
    if (isLoggedIn) {
      onStartReading();
      return;
    }
    startGuestSpread();
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
              <p className="aura-landing-hero__eyebrow">{offer.heroEyebrow}</p>
              <h1 className="font-mystic-display aura-landing-hero__title">{offer.heroTitle}</h1>
              <p className="aura-landing-hero__subtitle">{offer.heroSubtitle}</p>
              <HeroQuestionField className="mt-6" onQuestionSubmit={(question) => startGuestSpread(question)} />
              <div className="aura-landing-hero__actions">
                <button type="button" onClick={handlePrimaryCta} className="btn-luxe btn-luxe--md btn-luxe--gold">
                  {offer.primaryCta}
                </button>
                <button type="button" onClick={handleSecondaryCta} className="btn-luxe btn-luxe--md btn-luxe--ghost">
                  {offer.secondaryCta}
                </button>
              </div>
              <p className="aura-landing-hero__trust aura-landing-hero__trust--prominent">{offer.heroMicrocopy}</p>
              <p className="aura-landing-hero__pricing">{offer.pricingLine}</p>
            </motion.div>

            <motion.div
              className="aura-landing-hero__visual"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              aria-hidden
            >
              <LandingHeroVisual masters={masters} />
            </motion.div>
          </div>
        </section>
      ) : null}

      {!isLoggedIn && showHero ? (
        <section id={GUEST_SPREAD_SECTION_ID} className="aura-landing-section aura-landing-section--guest-spread">
          <div className="mx-auto max-w-6xl">
            <div className="aura-landing-section__head">
              <h2 className="font-mystic-display aura-landing-section__title">Ваш бесплатный расклад</h2>
              <p className="aura-landing-section__subtitle">
                Откройте три карты сейчас — регистрация понадобится только для расшифровки и продолжения.
              </p>
            </div>
            <GuestTripletDraw />
          </div>
        </section>
      ) : null}

      {showHero || afterQuickQuestions ? (
        <QuickQuestions
          showQuestionField={false}
          onQuestionSelect={!isLoggedIn ? (question) => startGuestSpread(question) : undefined}
        />
      ) : null}

      {onOpenRitual ? (
        <section className="ritual-cta-banner" aria-labelledby="ritual-cta-banner-title">
          <div className="ritual-cta-banner__inner">
            <span className="ritual-cta-banner__icon" aria-hidden>
              🕯
            </span>
            <div className="ritual-cta-banner__copy">
              <h2 id="ritual-cta-banner-title" className="ritual-cta-banner__title">
                Обряд с мастером
              </h2>
              <p className="ritual-cta-banner__text">
                Притяжение, достаток, защита, удача, здоровье, карьера — ритуал с картами,
                атрибутами и словом силы под вашу ситуацию.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenRitual}
              className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn"
            >
              Заказать обряд
            </button>
          </div>
        </section>
      ) : null}

      {afterQuickQuestions ? (
        <div className="aura-landing__after-quick">{afterQuickQuestions}</div>
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
          enforceBalance={isLoggedIn}
          onInsufficientRunes={(payload) => {
            onInsufficientRunes?.(payload);
            onOpenPaywall?.();
          }}
          layout="grid"
          title="Выберите своего проводника"
          subtitle="Каждый мастер работает в своей системе — от классического Таро до рун и астрологии."
          showExpertCta={expertRegistrationEnabled}
          showDisclaimer={false}
          className="aura-landing-masters"
        />
      ) : null}

      {showSellingSections ? (
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
      ) : null}

      {showHero ? (
        <OfflineSpreadBlock
          onOpenPhoto={onOpenPhotoReading}
          onOpenMarkCards={onOpenMarkCards}
          photoCostLabel={photoNavLabel?.replace(/^Фото ·\s*/, "")}
        />
      ) : null}

      {showSellingSections ? (
        <section className="aura-landing-section">
          <div className="mx-auto max-w-6xl">
            <div className="aura-landing-section__head">
              <h2 className="font-mystic-display aura-landing-section__title">Почему Zovus</h2>
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
      ) : null}

      {showSellingSections ? (
        <section className="aura-landing-section aura-landing-section--trust">
          <div className="mx-auto max-w-6xl">
            <div className="aura-landing-section__head">
              <h2 className="font-mystic-display aura-landing-section__title">Доверие и прозрачность</h2>
              <p className="aura-landing-section__subtitle">
                Сначала карты и ясность — потом регистрация и продолжение сеанса.
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
                {TRUST_POINTS.map((item) => (
                  <article key={item.title} className="aura-landing-review">
                    <div className="aura-landing-benefit__icon mb-3">
                      <item.icon className="h-5 w-5 text-aura-champagne" strokeWidth={1.5} />
                    </div>
                    <h3 className="font-display text-base font-semibold text-white">{item.title}</h3>
                    <p className="aura-landing-review__text mt-2">{item.text}</p>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {showTariffs ? <LandingSeoHub /> : null}

      {showSellingSections ? (
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
      ) : null}

      {showSellingSections ? <AndroidDownloadBlock /> : null}

      {showSellingSections ? (
        <section className="aura-landing-section aura-landing-section--final px-4 sm:px-0">
          <motion.div
            className="aura-landing-final__panel mx-auto max-w-3xl text-center"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <h2 className="font-mystic-display aura-landing-final__title">
              Откройте карты — и получите свой ответ
            </h2>
            <p className="aura-landing-final__text">{offer.heroSubtitle}</p>
            <button type="button" onClick={handlePrimaryCta} className="btn-luxe btn-luxe--md btn-luxe--gold">
              {offer.primaryCta}
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

      {!isLoggedIn && showHero ? (
        <LandingStickyCta label={offer.primaryCta} onClick={handlePrimaryCta} />
      ) : null}
    </div>
  );
}
