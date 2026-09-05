"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { useAuth } from "@/lib/useAuth";
import type { RuneActionType } from "@/lib/rune-costs";
import { buildRegisterHref } from "@/lib/post-auth-return";
import { trackSeoEvent } from "@/lib/seo/metrika";
import { useScrollReveal } from "@/hooks/useScrollReveal";

type GiftExample = {
  costKey: RuneActionType;
  /** Plural forms for the count phrase: [«фото-расклад», «фото-расклада», «фото-раскладов»]. */
  unit: [one: string, few: string, many: string];
};

/** Real products a new user can try — prices always come from the live server config. */
const GIFT_EXAMPLES: GiftExample[] = [
  { costKey: "VISION_ANALYSIS", unit: ["фото-расклад", "фото-расклада", "фото-раскладов"] },
  { costKey: "READING", unit: ["расшифровка расклада", "расшифровки расклада", "расшифровок расклада"] },
  {
    costKey: "NUMEROLOGY_SESSION",
    unit: ["разбор Матрицы судьбы", "разбора Матрицы судьбы", "разборов Матрицы судьбы"],
  },
];

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod100 = Math.abs(n) % 100;
  const mod10 = mod100 % 10;
  if (mod100 >= 11 && mod100 <= 14) return many;
  if (mod10 === 1) return one;
  if (mod10 >= 2 && mod10 <= 4) return few;
  return many;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Homepage starter-gift block. Display only — the grant itself stays
 * server-authoritative in the registration path.
 * Renders nothing for authenticated users and nothing until the rune
 * config actually arrived from the server, so every number shown matches
 * what the server will really charge and grant.
 */
export default function EditorialStarterGiftSection() {
  const { config, fromServer } = useRuneConfig();
  const { isLoggedIn, loading: authLoading } = useAuth();
  const { ref, className } = useScrollReveal<HTMLElement>();
  const trackedRef = useRef(false);

  const shown = fromServer && config.starterRunes > 0 && !authLoading && !isLoggedIn;

  useEffect(() => {
    if (!shown || trackedRef.current) return;
    trackedRef.current = true;
    trackSeoEvent("starter_gift_view", { placement: "home" });
  }, [shown]);

  if (!shown) return null;

  const starter = config.starterRunes;

  const chips = GIFT_EXAMPLES.map((example) => {
    const price = config.costs[example.costKey] ?? 0;
    if (price <= 0) return null;
    const count = Math.floor(starter / price);
    if (count >= 2) {
      return {
        id: example.costKey,
        title: `${count} ${pluralRu(count, example.unit[0], example.unit[1], example.unit[2])}`,
        note: `по ${price} ᚢ`,
      };
    }
    if (count === 1) {
      return {
        id: example.costKey,
        title: capitalize(example.unit[0]),
        note: `${price} ᚢ — хватает целиком`,
      };
    }
    // Product costs more than the starter package: honest partial-coverage framing.
    return {
      id: example.costKey,
      title: capitalize(config.labels[example.costKey] ?? example.unit[0]),
      note: `${starter} ᚢ — вклад в стоимость ${price} ᚢ`,
    };
  })
    .filter((chip): chip is NonNullable<typeof chip> => chip !== null)
    .slice(0, 3);

  return (
    <section
      ref={ref}
      className={`editorial-section editorial-starter-gift ${className}`}
      aria-labelledby="editorial-starter-gift-title"
    >
      <div className="editorial-landing__inner">
        <div className="editorial-starter-pack__card editorial-starter-gift__card salon-reveal__item">
          <div className="editorial-starter-pack__glow" aria-hidden />
          <div className="editorial-starter-pack__copy">
            <p className="editorial-starter-pack__eyebrow">Начните бесплатно</p>
            <h2 id="editorial-starter-gift-title" className="editorial-starter-pack__title">
              Ваш первый разбор — начало личной истории
            </h2>
            <p className="editorial-starter-gift__amount">При первой регистрации — {starter} ᚢ</p>
            <ul className="editorial-starter-gift__points">
              <li>Сохранённые разборы — перечитывайте, когда захотите</li>
              <li>3 карты дня бесплатно раз в сутки</li>
              <li>{starter} ᚢ на дополнительные разборы — цена видна до начала</li>
            </ul>
            <div className="editorial-starter-pack__actions">
              <Link
                href={buildRegisterHref("/")}
                prefetch={false}
                className="editorial-btn editorial-btn--gold"
                onClick={() => trackSeoEvent("starter_gift_cta_click", { placement: "home" })}
              >
                Создать бесплатный аккаунт
              </Link>
            </div>
            <p className="editorial-starter-pack__fine">Без банковской карты. Решение о платных разборах — за вами.</p>
            <details className="editorial-starter-gift__details">
            <summary>На что хватит {starter} ᚢ</summary>
            <p className="editorial-starter-pack__fine">Примеры на выбор: весь подарок на один из форматов. Количество указано по обычной цене, без дополнительных уточнений.</p>
            <ul className="editorial-starter-gift__chips" aria-label={`На что хватит ${starter} ᚢ`}>
              {chips.map((chip) => (
                <li key={chip.id} className="editorial-starter-gift__chip">
                  <span className="editorial-starter-gift__chip-title">{chip.title}</span>
                  <span className="editorial-starter-gift__chip-note">{chip.note}</span>
                </li>
              ))}
            </ul>
            <p className="editorial-starter-pack__fine">
              ᚢ — внутренняя валюта Zovus. Начисляются один раз при первой регистрации.
            </p>
            </details>
          </div>
        </div>
      </div>
    </section>
  );
}
