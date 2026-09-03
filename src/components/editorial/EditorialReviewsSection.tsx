"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import {
  LANDING_REVIEW_PRODUCT_LABELS,
  formatLandingReviewWhen,
  type PublicLandingReview,
} from "@/lib/landing-reviews-shared";
import StarRow from "./ReviewStars";

type Summary = { count: number; averageRating: number };
type Cursor = { publishedAt: string; id: string };

function ruReviews(n: number): string {
  const n10 = n % 10;
  const n100 = n % 100;
  if (n10 === 1 && n100 !== 11) return `${n} отзыв`;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return `${n} отзыва`;
  return `${n} отзывов`;
}

function ReviewCard({ review }: { review: PublicLandingReview }) {
  const when = formatLandingReviewWhen(review.publishedAt);
  const meta = [LANDING_REVIEW_PRODUCT_LABELS[review.product], review.city, when]
    .filter(Boolean)
    .join(" · ");
  return (
    <article
      className="editorial-reviews__card"
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

  const [enabled, setEnabled] = useState(true);
  const [items, setItems] = useState<PublicLandingReview[]>([]);
  const [summary, setSummary] = useState<Summary>({ count: 0, averageRating: 0 });
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);
  const loadMoreLock = useRef(false);
  const [canPrevious, setCanPrevious] = useState(false);
  const [canNext, setCanNext] = useState(false);
  const updateNavigation = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setCanPrevious(track.scrollLeft > 2);
    setCanNext(track.scrollLeft + track.clientWidth < track.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    updateNavigation();
    const observer = new ResizeObserver(updateNavigation);
    observer.observe(track);
    return () => observer.disconnect();
  }, [items, loading, updateNavigation]);

  const scrollReviews = (direction: number) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({
      left: direction * track.clientWidth,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  };

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
            Впечатления пользователей после сеансов и разборов.
          </p>
          {/* Always rendered with reserved min-height: revealing the summary
              post-load must not shift the intro block (CLS). */}
          <p className="editorial-reviews__summary">
            {!loading && summary.count > 0 ? (
              <>
                <span className="editorial-reviews__avg">{averageLabel}</span>
                <StarRow rating={Math.round(summary.averageRating)} />
                <span>{ruReviews(summary.count)}</span>
              </>
            ) : null}
          </p>
        </header>

        {loading ? (
          <p className="editorial-reviews__status">Загрузка отзывов…</p>
        ) : items.length > 0 ? (
          <>
            <div className="editorial-reviews__navigation" aria-label="Листать отзывы">
              <button type="button" className="editorial-reviews__arrow" aria-label="Предыдущие отзывы" aria-controls={`${baseId}-track`} disabled={!canPrevious} onClick={() => scrollReviews(-1)}>←</button>
              <button type="button" className="editorial-reviews__arrow" aria-label="Следующие отзывы" aria-controls={`${baseId}-track`} disabled={!canNext} onClick={() => scrollReviews(1)}>→</button>
            </div>
            <div ref={trackRef} id={`${baseId}-track`} className="editorial-reviews__track" onScroll={updateNavigation} tabIndex={0} role="region" aria-label="Отзывы пользователей" onKeyDown={(event) => {
              if (event.target !== event.currentTarget) return;
              if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                event.preventDefault();
                scrollReviews(event.key === "ArrowLeft" ? -1 : 1);
              }
            }}>
              {items.map((review) => <ReviewCard key={review.id} review={review} />)}
              {cursor ? (
                <div className="editorial-reviews__load-card">
                  <button type="button" className="editorial-btn editorial-btn--ghost" disabled={loadingMore} onClick={() => {
                    if (loadMoreLock.current) return;
                    loadMoreLock.current = true;
                    setLoadingMore(true);
                    setLoadError(false);
                    void loadPage(cursor, true).catch(() => setLoadError(true)).finally(() => {
                      loadMoreLock.current = false;
                      setLoadingMore(false);
                    });
                  }}>{loadingMore ? "Загружаем…" : "Ещё отзывы"}</button>
                  {loadError ? <p role="alert">Не удалось загрузить отзывы. Попробуйте ещё раз.</p> : null}
                </div>
              ) : null}
            </div>
          </>
        ) : (
          <p className="editorial-reviews__status">Отзывы появятся после модерации.</p>
        )}



      </div>
    </section>
  );
}
