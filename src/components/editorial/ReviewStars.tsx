"use client";
import { KeyboardEvent, useRef } from "react";
export default function StarRow({
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
  const starRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // ARIA radio-group pattern: roving tabindex + arrow/Home/End keys, so Tab
  // enters the group once instead of walking all five stars.
  const onGroupKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || !onChange) return;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") next = Math.min(5, rating + 1);
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") next = Math.max(1, rating - 1);
    else if (e.key === "Home") next = 1;
    else if (e.key === "End") next = 5;
    if (next == null) return;
    e.preventDefault();
    onChange(next);
    starRefs.current[next - 1]?.focus();
  };

  return (
    <div
      className="editorial-reviews__stars"
      role={interactive ? "radiogroup" : "img"}
      aria-labelledby={labelledBy}
      aria-label={interactive ? undefined : `${rating} из 5`}
      onKeyDown={interactive ? onGroupKeyDown : undefined}
    >
      {[1, 2, 3, 4, 5].map((value) =>
        interactive ? (
          <button
            key={value}
            ref={(el) => {
              starRefs.current[value - 1] = el;
            }}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} из 5`}
            tabIndex={rating === value || (rating < 1 && value === 1) ? 0 : -1}
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

