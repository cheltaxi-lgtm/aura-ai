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
import HeroQuestionField from "@/components/seo/HeroQuestionField";

const QUICK_INTENT_SLUGS = [
  "chto-on-chuvstvuet",
  "vernyotsya-li-on",
  "est-li-izmena",
  "chto-so-mnoy-proiskhodit",
  "stoit-li-menyat-rabotu",
  "kuda-ukhodyat-dengi",
  "god-vpered",
  "kak-otpustit-cheloveka",
  "sovmestimost-12",
  "lenormand-liniya",
  "blizhayshee-budushchee",
] as const;

const ENTRY_LINKS = [
  { label: "Все расклады", href: "/rasklady" },
  { label: "Фото-расклад", href: "/?photo=1" },
  { label: "Отметить карты", href: "/?photo=1&mode=mark" },
  { label: "Обряды", href: "/obryady" },
  { label: "Нумерология", href: "/numerology" },
  { label: "Статьи", href: "/statyi" },
  { label: "Совместимость", href: "/joint-reading" },
  { label: "Карты Таро", href: "/cards" },
] as const;

function readUserGender(): UserGender {
  const profile = readStoredProfile();
  return profile?.gender === "male" || profile?.gender === "female" ? profile.gender : null;
}

export default function QuickQuestions({ showQuestionField = true }: { showQuestionField?: boolean }) {
  const [userGender, setUserGender] = useState<UserGender>(null);

  useEffect(() => {
    setUserGender(readUserGender());
  }, []);

  const featured = getFeaturedSpreadIntents(4);

  const go = (href: string, slug?: string) => (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    if (slug) trackQuickQuestionClick(slug);
    window.location.assign(href);
  };

  const quickLabel = (slug: string) => {
    const intent = getSpreadIntentBySlug(slug);
    if (!intent) return slug;
    return formatQuickQuestionLabel(resolveIntentCopy(intent, userGender).title);
  };

  return (
    <section className="quick-questions" aria-labelledby="quick-questions-title">
      <div className="quick-questions__halo" aria-hidden />
      <div className="quick-questions__panel">
        <div className="quick-questions__head">
          <p className="quick-questions__eyebrow">Быстрый старт</p>
          <h2 id="quick-questions-title" className="quick-questions__title">
            С чего начнём?
          </h2>
        </div>
        {showQuestionField ? <HeroQuestionField compact className="mb-5" /> : null}
        <p className="quick-questions__subtitle">
          Выберите вопрос — мы подберём мастера и расклад.
          {userGender === "male"
            ? " Формулировки про партнёршу."
            : userGender === "female"
              ? " Формулировки про партнёра."
              : null}
        </p>

        <div className="quick-questions__chips">
          {QUICK_INTENT_SLUGS.map((slug) => (
            <a
              key={slug}
              href={`/?intent=${encodeURIComponent(slug)}`}
              onClick={go(`/?intent=${encodeURIComponent(slug)}`, slug)}
              className="quick-questions__chip"
            >
              {quickLabel(slug)}
            </a>
          ))}
        </div>

        <div className="quick-questions__entries" aria-label="Разделы Zovus">
          {ENTRY_LINKS.map((item) => (
            <a key={item.href} href={item.href} onClick={go(item.href)} className="quick-questions__entry">
              {item.label}
            </a>
          ))}
        </div>

        {featured.length > 0 ? (
          <p className="quick-questions__featured">
            Популярное:{" "}
            {featured.map((item, i) => (
              <span key={item.slug}>
                {i > 0 ? " · " : ""}
                <a
                  href={`/?intent=${encodeURIComponent(item.slug)}`}
                  onClick={go(`/?intent=${encodeURIComponent(item.slug)}`, item.slug)}
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
