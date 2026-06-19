/** Gold stylized zodiac glyph (replaces plain emoji). */
import type { ReactNode } from "react";

export default function ZodiacGlyph({
  signName,
  className = "h-4 w-4",
}: {
  signName: string;
  className?: string;
}) {
  const paths: Record<string, ReactNode> = {
    Овен: <path d="M8 14c0-3 2-6 5-6s5 3 5 6M5 14h6M13 14h6" stroke="currentColor" strokeWidth="1.2" fill="none" />,
    Телец: <path d="M6 12c0-3 2.5-5 6-5s6 2 6 5-2.5 5-6 5-6-2-6-5z M8 10c1-1 2.5-1 4 0" stroke="currentColor" strokeWidth="1.2" fill="none" />,
    Близнецы: (
      <>
        <path d="M6 6v10M14 6v10M6 8h8M6 12h8" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </>
    ),
    Рак: <path d="M5 11c0-3 2-5 5-5 2 0 4 1 5 2-1 4-1 5-2 3 0 5 2 5 5" stroke="currentColor" strokeWidth="1.2" fill="none" />,
    Лев: (
      <>
        <circle cx="10" cy="10" r="4" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M6 14c2 2 6 2 8 0" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </>
    ),
    Дева: (
      <>
        <path d="M8 5v8M8 13c-2 0-3 1-3 3" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M12 5c2 3 2 6 0 9" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </>
    ),
    Весы: <path d="M4 12h12M6 8h8M8 8v4M12 8v4" stroke="currentColor" strokeWidth="1.2" fill="none" />,
    Скорпион: (
      <>
        <path d="M6 6c3 0 5 2 5 5v3M11 14l2 2" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M8 6v8" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </>
    ),
    Стрелец: <path d="M6 14l8-8M10 6h4v4" stroke="currentColor" strokeWidth="1.2" fill="none" />,
    Козерог: <path d="M6 14V8c0-2 2-3 4-3s4 1 4 3v6M6 11h8" stroke="currentColor" strokeWidth="1.2" fill="none" />,
    Водолей: <path d="M4 10h4M8 8h4M12 10h4M6 12h4M10 14h4" stroke="currentColor" strokeWidth="1.2" fill="none" />,
    Рыбы: (
      <>
        <path d="M5 10c2-2 4-2 6 0s4 2 6 0" stroke="currentColor" strokeWidth="1.2" fill="none" />
        <path d="M5 10v2M15 10v2" stroke="currentColor" strokeWidth="1.2" fill="none" />
      </>
    ),
  };

  return (
    <svg
      viewBox="0 0 20 20"
      className={`inline-block shrink-0 text-aura-champagne ${className}`}
      aria-hidden
      fill="none"
    >
      {paths[signName] ?? (
        <circle cx="10" cy="10" r="6" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      )}
    </svg>
  );
}
