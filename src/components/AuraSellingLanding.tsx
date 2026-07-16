"use client";

import { type ReactNode, useEffect, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Compass,
  Flame,
  Lock,
  Moon,
  Shield,
  Sparkles,
  Star,
  Sun,
  X,
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
  GUEST_SPREAD_START_EVENT,
  LANDING_QUESTION_KEY,
  resolveLandingHeroVariant,
  type GuestSpreadStartDetail,
  type LandingHeroVariant,
} from "@/lib/landing-offer";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import { trackLandingView, trackLandingPrimaryCtaClick } from "@/lib/seo/metrika";
import {
  buildLoginHref,
  buildRegisterHref,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import LandingSocialProofStats, {
  useLandingSocialProofVisible,
} from "@/components/seo/LandingSocialProofStats";
import EditorialHeroSection from "@/components/editorial/EditorialHeroSection";
import EditorialTopicsSection from "@/components/editorial/EditorialTopicsSection";
import EditorialSessionStepsSection from "@/components/editorial/EditorialSessionStepsSection";
import EditorialStarterPackSection from "@/components/editorial/EditorialStarterPackSection";
import EditorialPracticesSection from "@/components/editorial/EditorialPracticesSection";
import LoggedInHomeBanner from "@/components/editorial/LoggedInHomeBanner";
import { getSpreadIntentBySlug } from "@/lib/spread-intents/registry";
import { trackQuickQuestionClick } from "@/lib/seo/metrika";

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
    text: "Увидите краткий ориентир по символам, затем зарегистрируйтесь для полной трактовки и чата с мастером.",
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
    text: "Натальная карта, джйотиш и персональные периоды — или диалог с астрологом Shri Raj.",
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

const COMPARISON_ROWS = [
  {
    title: "Отвечает на ваш вопрос, а не выдаёт шаблон",
    them: "Общие фразы под любую карту — одинаковый текст для всех",
    us: "Расклад собирается под ваш вопрос и продолжается в диалоге с мастером",
  },
  {
    title: "Помнит контекст беседы",
    them: "Каждое сообщение — как в первый раз, бот не помнит предыдущий расклад",
    us: "Мастер удерживает контекст и ваши прошлые обращения",
  },
  {
    title: "Честная цена",
    them: "«Бесплатно» — пока не дойдёте до полной расшифровки или подписки",
    us: "Стоимость видна заранее в рублях, платите только за то, что открываете",
  },
  {
    title: "Доступ без ожидания",
    them: "Живой таролог — запись, очередь, оплата по минутам",
    us: "Мастер на связи 24/7, ответ за секунды",
  },
  {
    title: "Все традиции в одном месте",
    them: "Один сайт — одна система: либо Таро, либо гороскопы",
    us: "Таро, руны, астрология, нумерология, славянские обряды — в одном окне",
  },
  {
    title: "Честно о формате",
    them: "Скрывают, кто отвечает, или дают безликий шаблон",
    us: "Проводники в образах — с характером, традицией и прозрачными правилами",
  },
] as const;

const TRUST_POINTS = [
  {
    title: "Проводники в образах",
    text: "Каждый мастер ведёт в своей традиции — Таро, руны, астрология, нумерология.",
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
  /** Logged-in home: open spread flow from the custom question field (hero is hidden). */
  onCustomQuestionSubmit?: (question: string) => void;
  /** Logged-in home: start the selected catalog spread from quick question chips. */
  onQuickQuestionSelect?: (question: string, intentSlug?: string) => void;
  /** Display name for logged-in welcome banner. */
  homeUserName?: string | null;
  /** When false, parent renders LoggedInHomeBanner (e.g. above ReadingRecap). */
  showLoggedInHomeBanner?: boolean;
  /** Classic mystic shell or editorial mockup shell — same blocks and handlers. */
  layout?: "classic" | "editorial";
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
  onCustomQuestionSubmit,
  onQuickQuestionSelect,
  homeUserName,
  showLoggedInHomeBanner = true,
  layout = "classic",
}: AuraSellingLandingProps) {
  const isEditorial = layout === "editorial";
  const showLoggedInHome = isLoggedIn && !showHero && showLoggedInHomeBanner;
  const showQuickQuestionsBlock = showHero || Boolean(afterQuickQuestions) || showLoggedInHome;
  const { config, cost, formatRunes, formatRunesWithRub, ready } = useRuneConfig();
  const { expertRegistrationEnabled } = usePlatformFeatures();
  const [heroVariant, setHeroVariant] = useState<LandingHeroVariant>("a");
  const offer = buildLandingOfferCopy(config, formatRunes, formatRunesWithRub, heroVariant);
  useLandingSocialProofVisible(showSellingSections || (showHero && !isLoggedIn));

  useEffect(() => {
    const variant = resolveLandingHeroVariant();
    setHeroVariant(variant);
    if (showHero && !isLoggedIn) {
      trackLandingView({ hero_variant: isEditorial ? "editorial" : variant });
    }
  }, [showHero, isLoggedIn, isEditorial]);

  const scrollToMasters = () => {
    document.getElementById("наставники")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const scrollToSession = () => {
    document.getElementById("как-проходит-сеанс")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const handleTopic = (intentSlug: string) => {
    const intent = getSpreadIntentBySlug(intentSlug);
    if (!intent) return;
    trackQuickQuestionClick(intentSlug);
    if (onQuickQuestionSelect) {
      onQuickQuestionSelect(intent.questionTemplate, intentSlug);
      return;
    }
    startGuestSpread(intent.questionTemplate, intent.recommendedMasterId);
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
  };

  const handlePrimaryCta = (placement: "hero" | "sticky" | "final") => {
    if (isLoggedIn) {
      onStartReading();
      return;
    }
    trackLandingPrimaryCtaClick(placement);
    const storedQuestion =
      typeof window !== "undefined" ? sessionStorage.getItem(LANDING_QUESTION_KEY)?.trim() : "";
    startGuestSpread(storedQuestion || undefined);
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
    if (filter === "astrology" && isLoggedIn) {
      window.location.assign("/cabinet/astrology");
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
    <div className={isEditorial ? "editorial-landing" : "aura-landing"}>
      {!showHero ? (
        <h1 className="sr-only">
          Zovus — персональные эзотерические консультации, расклады на таро и рунах
        </h1>
      ) : null}
      {showHero && isEditorial ? (
        <EditorialHeroSection
          isLoggedIn={isLoggedIn}
          pricingLine={ready ? offer.pricingLine : undefined}
          onPrimaryCta={() => handlePrimaryCta("hero")}
          onSecondaryCta={scrollToSession}
          onQuestionSubmit={(question) =>
            onCustomQuestionSubmit ? onCustomQuestionSubmit(question) : startGuestSpread(question)
          }
        />
      ) : null}
      {showHero && !isEditorial ? (
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
                <button
                  type="button"
                  onClick={() => handlePrimaryCta("hero")}
                  className="btn-luxe btn-luxe--md btn-luxe--gold"
                >
                  {offer.primaryCta}
                </button>
                <button type="button" onClick={handleSecondaryCta} className="btn-luxe btn-luxe--md btn-luxe--ghost">
                  {offer.secondaryCta}
                </button>
              </div>
              <p className="aura-landing-hero__trust aura-landing-hero__trust--prominent">{offer.heroMicrocopy}</p>
              {ready ? <p className="aura-landing-hero__pricing">{offer.pricingLine}</p> : null}
              {!isLoggedIn ? <LandingSocialProofStats variant="hero" className="mt-5" /> : null}
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

      {showSellingSections && isEditorial && !isLoggedIn ? (
        <EditorialTopicsSection onTopic={handleTopic} />
      ) : null}

      {!isLoggedIn ? (
        <>
          <EditorialStarterPackSection onOpenFreeSpread={() => startGuestSpread()} />
          <GuestTripletDraw />
        </>
      ) : null}

      {showLoggedInHome ? (
        <LoggedInHomeBanner
          userName={homeUserName}
          onQuestionSubmit={onCustomQuestionSubmit ?? onQuickQuestionSelect}
        />
      ) : null}

      {showQuickQuestionsBlock ? (
        <QuickQuestions
          showQuestionField={!isLoggedIn && !showHero && !showLoggedInHome}
          onQuestionSelect={
            onQuickQuestionSelect ??
            ((question, intentSlug) => {
              const intent = intentSlug ? getSpreadIntentBySlug(intentSlug) : null;
              startGuestSpread(question, intent?.recommendedMasterId);
            })
          }
          onCustomQuestionSubmit={
            onCustomQuestionSubmit ??
            (isLoggedIn
              ? undefined
              : !showHero
                ? (question) => startGuestSpread(question)
                : undefined)
          }
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
          formatRunes={ready ? formatRunesWithRub : formatRunes}
          runeBalance={runeBalance}
          isUnlimited={isUnlimited}
          enforceBalance={isLoggedIn}
          onInsufficientRunes={(payload) => {
            onInsufficientRunes?.(payload);
            onOpenPaywall?.();
          }}
          layout="grid"
          rowVariant="default"
          title="Выберите своего проводника"
          subtitle="Каждый мастер работает в своей системе — от классического Таро до рун и астрологии."
          showExpertCta={expertRegistrationEnabled}
          showDisclaimer={false}
          className="aura-landing-masters"
        />
      ) : null}

      {showSellingSections && isEditorial ? <EditorialSessionStepsSection /> : null}

      {showSellingSections && isEditorial && !isLoggedIn ? (
        <section className="editorial-section" aria-label="Доверие">
          <div className="editorial-landing__inner flex justify-center">
            <LandingSocialProofStats variant="trust" />
          </div>
        </section>
      ) : null}

      {showSellingSections && isEditorial ? (
        <EditorialPracticesSection isLoggedIn={isLoggedIn} />
      ) : null}

      {showSellingSections && !isEditorial ? (
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

      {showSellingSections && !isEditorial ? (
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

      {showSellingSections && !isEditorial ? (
        <section className="aura-landing-section aura-landing-section--compare">
          <div className="mx-auto max-w-4xl">
            <div className="aura-landing-section__head">
              <span className="aura-landing-compare__eyebrow">Сравнение</span>
              <h2 className="font-mystic-display aura-landing-section__title">Zovus устроен иначе</h2>
              <p className="aura-landing-section__subtitle">
                Мы изучили, как обычно работают боты-гадалки, шаблонные сайты и платные консультации —
                и сделали по-другому.
              </p>
            </div>
            <div className="aura-landing-compare glass-panel">
              <div className="aura-landing-compare__header">
                <span className="aura-landing-compare__col-label aura-landing-compare__col-label--them">
                  Как обычно
                </span>
                <span className="aura-landing-compare__col-label aura-landing-compare__col-label--us">
                  В Zovus
                </span>
              </div>
              {COMPARISON_ROWS.map((row, i) => (
                <motion.div
                  key={row.title}
                  className="aura-landing-compare__row"
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06, duration: 0.4 }}
                >
                  <h3 className="aura-landing-compare__row-title">{row.title}</h3>
                  <div className="aura-landing-compare__cell aura-landing-compare__cell--them">
                    <X className="aura-landing-compare__icon aura-landing-compare__icon--them" strokeWidth={1.75} />
                    <span>{row.them}</span>
                  </div>
                  <div className="aura-landing-compare__cell aura-landing-compare__cell--us">
                    <Check className="aura-landing-compare__icon aura-landing-compare__icon--us" strokeWidth={1.75} />
                    <span>{row.us}</span>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {showSellingSections && !isEditorial ? (
        <section className="aura-landing-section aura-landing-section--trust">
          <div className="mx-auto max-w-6xl">
            <div className="aura-landing-section__head">
              <h2 className="font-mystic-display aura-landing-section__title">Доверие и прозрачность</h2>
              <p className="aura-landing-section__subtitle">
                Тысячи людей уже открыли карты сегодня — присоединяйтесь, пока мастера онлайн.
              </p>
            </div>
            <div className="aura-landing-trust">
              <LandingSocialProofStats variant="trust" className="aura-landing-trust__stats" />
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

      {showSellingSections && !isEditorial ? (
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
                    {isLoggedIn && dir.filter === "astrology" ? "К натальной карте" : "К мастерам"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </motion.button>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {showTariffs ? (
        <LandingSeoHub
          rubPerRune={config.rubPerRune}
          readingPriceLabel={
            ready && config.enabled ? formatRunesWithRub(cost("READING")) : undefined
          }
          compact
        />
      ) : null}

      {showSellingSections && !isEditorial ? <AndroidDownloadBlock /> : null}

      {showSellingSections && !isEditorial ? (
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
            <p className="aura-landing-final__text">{offer.finalCtaText}</p>
            <button
              type="button"
              onClick={() => handlePrimaryCta("final")}
              className="btn-luxe btn-luxe--md btn-luxe--gold"
            >
              {offer.primaryCta}
              <ArrowRight className="h-4 w-4" />
            </button>
            {!isLoggedIn ? (
              <p className="aura-landing-final__login">
                Уже есть аккаунт?{" "}
                <Link
                  href={buildLoginHref(resolveRegistrationReturnTo())}
                  className="aura-landing-final__login-link"
                >
                  Войти
                </Link>
                {" · "}
                <Link
                  href={buildRegisterHref(resolveRegistrationReturnTo({ guestSpread: true }))}
                  className="aura-landing-final__login-link"
                >
                  Создать аккаунт
                </Link>
              </p>
            ) : null}
          </motion.div>
        </section>
      ) : null}

      {!isEditorial && !isLoggedIn ? (
        <LandingStickyCta label={offer.primaryCta} onClick={() => handlePrimaryCta("sticky")} />
      ) : null}
    </div>
  );
}
