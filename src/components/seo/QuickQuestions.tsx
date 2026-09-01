"use client";

import { useEffect, useState, type MouseEvent } from "react";
import { getFeaturedSpreadIntents, getSpreadIntentBySlug } from "@/lib/spread-intents";
import {
  formatQuickQuestionLabel,
  resolveIntentCopy,
  type UserGender,
} from "@/lib/spread-intents/gender-copy";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { trackQuickQuestionClick } from "@/lib/seo/metrika";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import HeroQuestionField from "@/components/seo/HeroQuestionField";

const QUICK_INTENT_SLUGS = [
  "chto-mezhdu-nami",
  "chto-so-mnoy-proiskhodit",
  "zhdat-ili-zabyt",
  "stoit-li-menyat-rabotu",
  "kuda-ukhodyat-dengi",
  "blizhayshee-budushchee",
  "god-vpered",
  "kak-otpustit-cheloveka",
  "sovmestimost-pary",
  "lenormand-liniya",
  "chto-on-chuvstvuet",
] as const;

const ENTRY_LINKS = [
  { label: "Матрица судьбы", href: "/numerology/destiny-matrix" },
  { label: "Натальная карта", href: "/natalnaya-karta" },
  { label: "Дизайн Человека", href: "/dizayn-cheloveka" },
  { label: "Все расклады", href: "/rasklady" },
  { label: "Фото-расклад", href: "/photo-rasklad" },
  { label: "Аура по фото", href: "/aura" },
  { label: "Гадание по ладони", href: "/gadanie-po-ladoni" },
  { label: "Таро онлайн", href: "/taro" },
  { label: "Гадание", href: "/gadanie" },
  { label: "Обряды", href: "/obryady" },
  { label: "Нумерология", href: "/numerology" },
  { label: "Статьи", href: "/statyi" },
  { label: "Совместимость", href: "/joint-reading" },
  { label: "Telegram-бот", href: "/telegram" },
  { label: "Карты Таро", href: "/cards" },
] as const;

function readUserGender(): UserGender {
  const profile = readStoredProfile();
  return profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null;
}

type QuickQuestionsProps = {
  showQuestionField?: boolean;
  onQuestionSelect?: (question: string, intentSlug?: string) => void;
  /** Custom question field only — chips keep using intent links when logged in. */
  onCustomQuestionSubmit?: (question: string) => void;
};

export default function QuickQuestions({
  showQuestionField = true,
  onQuestionSelect,
  onCustomQuestionSubmit,
}: QuickQuestionsProps) {
  const [userGender, setUserGender] = useState<UserGender>(null);
  // /aura 404s while the module kill-switch is off — never link to it.
  const { auraReadingEnabled, palmReadingEnabled } = usePlatformFeatures();
  const entryLinks = ENTRY_LINKS.filter(
    (item) =>
      (item.href !== "/aura" || auraReadingEnabled) &&
      (item.href !== "/gadanie-po-ladoni" || palmReadingEnabled)
  );

  useEffect(() => {
    setUserGender(readUserGender());
  }, []);

  const featured = getFeaturedSpreadIntents(4);

  const go =
    (href: string, slug?: string, question?: string) =>
    (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (slug) trackQuickQuestionClick(slug);
    if (question && onQuestionSelect) {
      onQuestionSelect(question, slug);
      return;
    }
    window.location.assign(href);
  };

  const quickLabel = (slug: string) => {
    const intent = getSpreadIntentBySlug(slug);
    if (!intent) return slug;
    return formatQuickQuestionLabel(resolveIntentCopy(intent, userGender).title);
  };

  const quickQuestion = (slug: string) => {
    const intent = getSpreadIntentBySlug(slug);
    return intent ? resolveIntentCopy(intent, userGender).questionTemplate : quickLabel(slug);
  };

  return (
    <section className="quick-questions" aria-labelledby="quick-questions-title">
      <div className="quick-questions__halo" aria-hidden />
      <div className="quick-questions__panel">
        <div className="quick-questions__head">
          <p className="quick-questions__eyebrow">Быстрый старт</p>
          <h2 id="quick-questions-title" className="quick-questions__title">
            О чём хотите ясности?
          </h2>
        </div>
        <p className="quick-questions__subtitle">
          Выберите готовый вопрос — откроем подходящий расклад.
          {userGender === "male"
            ? " Формулировки про партнёршу."
            : userGender === "female"
              ? " Формулировки про партнёра."
              : null}
        </p>
        {showQuestionField ? (
          <HeroQuestionField
            compact
            className="quick-questions__search"
            onQuestionSubmit={onCustomQuestionSubmit ?? onQuestionSelect}
          />
        ) : null}

        <p className="quick-questions__section-label">Популярные вопросы</p>
        <div className="quick-questions__chips">
          {QUICK_INTENT_SLUGS.map((slug) => {
            const seoHref = `/rasklady/${slug}`;
            return (
            <a
              key={slug}
              href={seoHref}
              onClick={go(seoHref, slug, quickQuestion(slug))}
              className="quick-questions__chip"
            >
              {quickLabel(slug)}
            </a>
            );
          })}
        </div>

        <div className="quick-questions__entries-wrap">
          <p className="quick-questions__section-label">Разделы</p>
          <div className="quick-questions__entries" aria-label="Разделы Zovus">
          {entryLinks.map((item) => (
            <a key={item.href} href={item.href} onClick={go(item.href)} className="quick-questions__entry">
              {item.label}
            </a>
          ))}
          </div>
        </div>

        {featured.length > 0 ? (
          <p className="quick-questions__featured">
            Популярное:{" "}
            {featured.map((item, i) => (
              <span key={item.slug}>
                {i > 0 ? " · " : ""}
                <a
                  href={`/rasklady/${item.slug}`}
                  onClick={go(
                    `/rasklady/${item.slug}`,
                    item.slug,
                    quickQuestion(item.slug)
                  )}
                  className="quick-questions__featured-link"
                >
                  {resolveIntentCopy(item, userGender).title}
                </a>
              </span>
            ))}
          </p>
        ) : null}
      </div>
    </section>
  );
}
