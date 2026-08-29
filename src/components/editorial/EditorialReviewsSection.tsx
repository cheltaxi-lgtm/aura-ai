"use client";

import { FormEvent, useCallback, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { attachRecaptchaToken } from "@/lib/client-recaptcha";
import { EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import {
  LANDING_REVIEW_BODY_MAX,
  LANDING_REVIEW_BODY_MIN,
  LANDING_REVIEW_NAME_MAX,
  LANDING_REVIEW_PRODUCT_LABELS,
  LANDING_REVIEW_PRODUCTS,
  formatLandingReviewWhen,
  type LandingReviewProduct,
  type PublicLandingReview,
} from "@/lib/landing-reviews-shared";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";

const ERROR_COPY: Record<string, string> = {
  name_invalid: "Укажите имя без ссылок и цифр — как к вам обращаться.",
  body_short: "Напишите чуть подробнее — хотя бы пару предложений.",
  body_long: "Текст слишком длинный. Сократите, пожалуйста.",
  rating_invalid: "Поставьте оценку от 1 до 5 звёзд.",
  product_invalid: "Выберите, о чём отзыв.",
  already_pending: "Вы уже отправили отзыв — он на проверке.",
  rate_limited: "Слишком много попыток. Попробуйте завтра.",
  captcha: "Не удалось пройти проверку. Обновите страницу и попробуйте снова.",
};

type Summary = { count: number; averageRating: number };
type Cursor = { publishedAt: string; id: string };

function ruReviews(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} отзыв`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} отзыва`;
  return `${n} отзывов`;
}

function StarRow({
  rating,
  interactive,
  onChange,
  labelledBy,
}: {
  rating: number;
  interactive?: boolean;
  onChange?: (value: number) => void;
  labelledBy?: string;
}) {
  return (
    <div
      className="editorial-reviews__stars"
      role={interactive ? "radiogroup" : "img"}
      aria-labelledby={labelledBy}
      aria-label={interactive ? undefined : `${rating} из 5`}
    >
      {[1, 2, 3, 4, 5].map((value) =>
        interactive ? (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} из 5`}
            className={`editorial-reviews__star editorial-reviews__star--input ${value <= rating ? "is-on" : ""}`}
            onClick={() => onChange?.(value)}
          >
            ★
          </button>
        ) : (
          <span
            key={value}
            className={`editorial-reviews__star ${value <= rating ? "is-on" : ""}`}
            aria-hidden
          >
            ★
          </span>
        )
      )}
    </div>
  );
}

function ReviewCard({ review, index }: { review: PublicLandingReview; index: number }) {
  const when = formatLandingReviewWhen(review.publishedAt);
  const meta = [LANDING_REVIEW_PRODUCT_LABELS[review.product], review.city, when]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      className="editorial-reviews__card salon-reveal__item"
      style={{ ["--salon-i" as string]: index % 8 }}
    >
      <header className="editorial-reviews__card-head">
        <StarRow rating={review.rating} />
        <p className="editorial-reviews__author">{review.authorName}</p>
        <p className="editorial-reviews__meta">{meta}</p>
      </header>
      <p className="editorial-reviews__body">{review.body}</p>
    </article>
  );
}

export default function EditorialReviewsSection() {
  const { ref, className } = useScrollReveal<HTMLElement>();
  const baseId = useId();
  const { expertRegistrationEnabled, recaptcha, featuresLoaded } = usePlatformFeatures();

  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<PublicLandingReview[]>([]);
  const [summary, setSummary] = useState<Summary>({ count: 0, averageRating: 0 });
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [product, setProduct] = useState<LandingReviewProduct>("tarot");
  const [rating, setRating] = useState(5);
  const [body, setBody] = useState("");
  const [honeypot, setHoneypot] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const loadPage = useCallback(async (next?: Cursor | null, append = false) => {
    const params = new URLSearchParams();
    if (next) {
      params.set("publishedAt", next.publishedAt);
      params.set("id", next.id);
    }
    const res = await fetch(`/api/reviews?${params}`);
    const data = (await res.json().catch(() => ({}))) as {
      enabled?: boolean;
      items?: PublicLandingReview[];
      nextCursor?: Cursor | null;
      summary?: Summary;
    };
    if (!res.ok) throw new Error("load_failed");
    if (data.enabled === false) {
      setEnabled(false);
      return;
    }
    setEnabled(true);
    setItems((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
    setCursor(data.nextCursor ?? null);
    if (data.summary) setSummary(data.summary);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadPage()
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadPage]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (sending || sent) return;
    setError(null);
    setSending(true);

    const payload: Record<string, unknown> = {
      name,
      city: city.trim() || undefined,
      product,
      rating,
      body,
      website_url: honeypot,
    };

    try {
      if (featuresLoaded) {
        const captchaError = await attachRecaptchaToken(payload, "reviews", {
          expertRegistrationEnabled,
          recaptcha,
        });
        if (captchaError) {
          setError(ERROR_COPY.captcha);
          setSending(false);
          return;
        }
      }

      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        const code = typeof data.error === "string" ? data.error : "unknown";
        setError(ERROR_COPY[code] ?? "Не удалось отправить. Попробуйте позже.");
        setSending(false);
        return;
      }
      setSent(true);
      setSending(false);
    } catch {
      setError("Не удалось отправить. Проверьте соединение.");
      setSending(false);
    }
  };

  if (!enabled) return null;

  const averageLabel = summary.averageRating
    ? summary.averageRating.toLocaleString("ru-RU", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
    : "—";

  return (
    <section
      ref={ref}
      id={EDITORIAL_SECTION_IDS.reviews}
      className={`editorial-section editorial-reviews ${className} salon-reveal--stagger`}
      aria-labelledby={`${baseId}-title`}
    >
      <div className="editorial-landing__inner">
        <header className="editorial-reviews__intro">
          <h2 id={`${baseId}-title`} className="editorial-section__title">
            Отзывы
          </h2>
          <p className="editorial-section__subtitle">
            Как это ощущается после сеанса — коротко и по делу. Свой текст появится здесь после
            проверки.
          </p>
          {!loading && summary.count > 0 ? (
            <p className="editorial-reviews__summary">
              <span className="editorial-reviews__avg">{averageLabel}</span>
              <StarRow rating={Math.round(summary.averageRating)} />
              <span>{ruReviews(summary.count)}</span>
            </p>
          ) : null}
        </header>

        {loading ? (
          <p className="editorial-reviews__status">Загрузка отзывов…</p>
        ) : items.length > 0 ? (
          <div className="editorial-reviews__grid">
            {items.map((review, index) => (
              <ReviewCard key={review.id} review={review} index={index} />
            ))}
          </div>
        ) : (
          <p className="editorial-reviews__status">Пока тишина — можете написать первый отзыв ниже.</p>
        )}

        {cursor ? (
          <div className="editorial-reviews__more">
            <button
              type="button"
              className="editorial-btn editorial-btn--ghost"
              disabled={loadingMore}
              onClick={() => {
                setLoadingMore(true);
                void loadPage(cursor, true).finally(() => setLoadingMore(false));
              }}
            >
              {loadingMore ? "Загружаем…" : "Показать ещё"}
            </button>
          </div>
        ) : null}

        <div className="editorial-reviews__form-wrap">
          <h3 className="editorial-reviews__form-title">Оставить отзыв</h3>
          <p className="editorial-reviews__form-lead">
            Оценка звёздами и несколько предложений. Публикуем после модерации — без ссылок и без
            рекламы.
          </p>
          {sent ? (
            <p className="editorial-reviews__success" role="status">
              Спасибо. Отзыв ушёл на проверку и появится после модерации.
            </p>
          ) : (
            <form
              className="editorial-reviews__form relative"
              onSubmit={(e) => void onSubmit(e)}
              noValidate
              aria-busy={sending}
            >
              <div className="editorial-reviews__fields">
                <label className="editorial-reviews__field" htmlFor={`${baseId}-name`}>
                  <span>Имя</span>
                  <input
                    id={`${baseId}-name`}
                    name="name"
                    autoComplete="nickname"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    maxLength={LANDING_REVIEW_NAME_MAX}
                    placeholder="Как к вам обращаться"
                    disabled={sending}
                  />
                </label>
                <label className="editorial-reviews__field" htmlFor={`${baseId}-city`}>
                  <span>Город (необязательно)</span>
                  <input
                    id={`${baseId}-city`}
                    name="city"
                    autoComplete="address-level2"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    maxLength={48}
                    placeholder="Москва"
                    disabled={sending}
                  />
                </label>
                <fieldset className="editorial-reviews__field editorial-reviews__field--full">
                  <legend>О чём отзыв</legend>
                  <div className="editorial-reviews__chips">
                    {LANDING_REVIEW_PRODUCTS.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={`editorial-reviews__chip ${product === id ? "is-on" : ""}`}
                        aria-pressed={product === id}
                        onClick={() => setProduct(id)}
                        disabled={sending}
                      >
                        {LANDING_REVIEW_PRODUCT_LABELS[id]}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <div className="editorial-reviews__field editorial-reviews__field--full">
                  <span id={`${baseId}-rating`}>Оценка</span>
                  <StarRow
                    rating={rating}
                    interactive
                    onChange={setRating}
                    labelledBy={`${baseId}-rating`}
                  />
                </div>
                <label
                  className="editorial-reviews__field editorial-reviews__field--full"
                  htmlFor={`${baseId}-body`}
                >
                  <span>Текст</span>
                  <textarea
                    id={`${baseId}-body`}
                    name="body"
                    required
                    rows={5}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    minLength={LANDING_REVIEW_BODY_MIN}
                    maxLength={LANDING_REVIEW_BODY_MAX}
                    placeholder="Что спросили, что получили, чем это было полезно — без общих восторгов."
                    disabled={sending}
                  />
                  <span className="editorial-reviews__hint">
                    {body.trim().length}/{LANDING_REVIEW_BODY_MAX}
                  </span>
                </label>
                <label className="editorial-reviews__hp" aria-hidden tabIndex={-1}>
                  <span>Сайт</span>
                  <input
                    name="website_url"
                    tabIndex={-1}
                    autoComplete="off"
                    value={honeypot}
                    onChange={(e) => setHoneypot(e.target.value)}
                  />
                </label>
              </div>
              {error ? (
                <p className="editorial-reviews__error" role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="submit"
                className="editorial-btn editorial-btn--gold editorial-reviews__submit"
                disabled={sending}
              >
                {sending ? "Отправляем…" : "Отправить на модерацию"}
              </button>
              <p className="editorial-reviews__legal">
                Нажимая кнопку, вы соглашаетесь на обработку текста отзыва.{" "}
                <Link href="/privacy" className="editorial-reviews__legal-link">
                  Политика конфиденциальности
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
