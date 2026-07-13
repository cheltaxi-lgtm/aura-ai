"use client";

import { type MouseEvent } from "react";
import Link from "next/link";
import {
  getSpreadIntentsBySpreadId,
  getSpreadIntentBySlug,
  type SpreadIntentDefinition,
} from "@/lib/spread-intents";
import { resolveIntentCopy, type UserGender } from "@/lib/spread-intents/gender-copy";
import { buildSpreadStartUrl, navigateToUrl } from "@/lib/spread-intents/router";
import { getSpread } from "@/lib/spreads";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { useEffect, useMemo, useState } from "react";

const FEATURED_SLUGS = [
  "lenormand-liniya",
  "lenormand-svidanie",
  "kak-proyti-sobesedovanie",
  "na-novoe-znakomstvo",
] as const;

const goToIntent =
  (href: string) =>
  (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    navigateToUrl(href);
  };

function LenormandIntentLink({
  intent,
  userGender,
}: {
  intent: SpreadIntentDefinition;
  userGender: UserGender;
}) {
  const copy = resolveIntentCopy(intent, userGender);
  const href = buildSpreadStartUrl(intent);
  const spread = getSpread(intent.spreadId);

  return (
    <a
      href={href}
      onClick={goToIntent(href)}
      className="block rounded-xl border border-white/10 bg-white/5 p-4 transition hover:border-aura-gold/30"
    >
      <p className="font-medium text-white">{copy.title}</p>
      <p className="mt-1 line-clamp-2 text-sm text-white/55">{copy.intro}</p>
      <p className="mt-2 text-xs text-white/40">
        {spread.label} · {spread.cardCount} карт
      </p>
    </a>
  );
}

export default function LenormandCatalog() {
  const [userGender, setUserGender] = useState<UserGender>(null);

  useEffect(() => {
    const gender = readStoredProfile()?.gender;
    setUserGender(gender === "male" || gender === "female" ? gender : null);
  }, []);

  const featured = useMemo(
    () =>
      FEATURED_SLUGS.map((slug) => getSpreadIntentBySlug(slug)).filter(
        (i): i is SpreadIntentDefinition => Boolean(i)
      ),
    []
  );

  const all = useMemo(() => getSpreadIntentsBySpreadId("lenormand-line"), []);
  const featuredSet = useMemo(() => new Set(FEATURED_SLUGS), []);
  const rest = useMemo(() => all.filter((i) => !featuredSet.has(i.slug as (typeof FEATURED_SLUGS)[number])), [all, featuredSet]);

  return (
    <>
      <section className="mt-8">
        <h2 className="font-display text-lg text-aura-gold">Флагман: линия из 5 карт</h2>
        <p className="mt-1 text-sm text-white/55">
          Основа → развитие → ядро → исход → ключ. Прямой оракул для конкретного вопроса.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {featured.map((intent) => (
            <LenormandIntentLink key={intent.slug} intent={intent} userGender={userGender} />
          ))}
        </div>
      </section>

      {rest.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-lg text-aura-gold">Все расклады Ленорман</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {rest.slice(0, 40).map((intent) => (
              <LenormandIntentLink key={intent.slug} intent={intent} userGender={userGender} />
            ))}
          </div>
        </section>
      ) : null}

      <p className="mt-10 text-sm text-white/50">
        <Link href="/lenormand/sochetaniya" className="text-aura-gold hover:underline">
          Сочетания карт Ленорман
        </Link>
        {" · "}
        <Link href="/rasklady" className="text-aura-gold hover:underline">
          Все расклады Таро
        </Link>
      </p>
    </>
  );
}
