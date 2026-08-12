"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { ProLandingPublicPayload } from "@/modules/pro/landing-defaults";

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\n+/)
        .map((block) => block.trim())
        .filter(Boolean)
        .map((block, i) => (
          <p key={i} className="pro-mini__p">
            {block.split("\n").map((line, j, arr) => (
              <span key={j}>
                {line}
                {j < arr.length - 1 ? <br /> : null}
              </span>
            ))}
          </p>
        ))}
    </>
  );
}

export default function ProMiniLandingClient() {
  const params = useParams<{ slug: string }>();
  const [landing, setLanding] = useState<ProLandingPublicPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const slug = params.slug;
    if (!slug) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/pro/public/landing/${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (cancelled) return;
      if (!res.ok) {
        setErr("Страница недоступна");
        return;
      }
      const json = (await res.json()) as { landing?: ProLandingPublicPayload };
      if (!json.landing) {
        setErr("Страница недоступна");
        return;
      }
      setLanding(json.landing);
    })();
    return () => {
      cancelled = true;
    };
  }, [params.slug]);

  if (err) {
    return (
      <main className="pro-mini pro-mini--empty">
        <p className="pro-mini__eyebrow">Zovus Pro</p>
        <h1 className="pro-mini__title">Страница не найдена</h1>
        <p className="pro-mini__lead">Ссылка устарела или минилендинг ещё не опубликован.</p>
      </main>
    );
  }

  if (!landing) {
    return (
      <main className="pro-mini pro-mini--empty" aria-busy="true">
        <p className="pro-mini__eyebrow">Zovus Pro</p>
        <p className="pro-mini__lead">Загрузка…</p>
      </main>
    );
  }

  const accent = landing.accentColor?.trim() || undefined;
  const promoOpen =
    landing.promoRemaining == null || landing.promoRemaining > 0;

  return (
    <main
      className="pro-mini"
      style={accent ? ({ ["--pro-mini-accent" as string]: accent } as React.CSSProperties) : undefined}
    >
      <div className="pro-mini__atmosphere" aria-hidden />

      <header className="pro-mini__hero">
        <p className="pro-mini__eyebrow">Zovus Pro · {landing.displayName}</p>
        <h1 className="pro-mini__title">{landing.headline}</h1>
        <p className="pro-mini__lead">{landing.subheadline}</p>
        {landing.promoBadge && promoOpen ? (
          <p className="pro-mini__promo">{landing.promoBadge}</p>
        ) : null}
        {landing.priceRub != null ? (
          <p className="pro-mini__price">
            Далее — {landing.priceRub.toLocaleString("ru-RU")} ₽ за полный разбор
          </p>
        ) : null}
        <div className="pro-mini__cta-row">
          <Link href={landing.intakeUrl} className="pro-mini__cta">
            {landing.ctaLabel}
          </Link>
        </div>
        {landing.contactNote ? (
          <p className="pro-mini__note">{landing.contactNote}</p>
        ) : null}
      </header>

      <section className="pro-mini__section">
        <h2 className="pro-mini__h2">Кто я</h2>
        <Paragraphs text={landing.sections.who} />
      </section>

      <section className="pro-mini__section">
        <h2 className="pro-mini__h2">Что вы получите</h2>
        <Paragraphs text={landing.sections.what_you_get} />
      </section>

      <section className="pro-mini__section">
        <h2 className="pro-mini__h2">Что входит</h2>
        <div className="pro-mini__includes">
          {(
            [
              landing.sections.includes.natal,
              landing.sections.includes.matrix,
              landing.sections.includes.hd,
            ] as const
          ).map((block) => (
            <article key={block.title} className="pro-mini__include">
              <h3 className="pro-mini__h3">{block.title}</h3>
              <p className="pro-mini__p">{block.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="pro-mini__section">
        <h2 className="pro-mini__h2">Почему расчёт точный</h2>
        <Paragraphs text={landing.sections.accuracy} />
      </section>

      <section className="pro-mini__section">
        <h2 className="pro-mini__h2">Как это работает</h2>
        <Paragraphs text={landing.sections.how_it_works} />
      </section>

      <section className="pro-mini__section">
        <h2 className="pro-mini__h2">Чего не будет</h2>
        <Paragraphs text={landing.sections.wont_do} />
      </section>

      <footer className="pro-mini__footer">
        <Link href={landing.intakeUrl} className="pro-mini__cta">
          {landing.ctaLabel}
        </Link>
        {landing.contactPublic ? (
          <p className="pro-mini__note">{landing.contactPublic}</p>
        ) : null}
        <p className="pro-mini__legal">18+ · познавательный формат · данные только для расчёта</p>
      </footer>
    </main>
  );
}
