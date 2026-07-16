"use client";

import { useEffect, useState } from "react";
import { Hexagon } from "lucide-react";
import { PRICING } from "@/lib/config/pricing";
import { readStoredProfile } from "@/lib/home-flow-storage";
import { parseBirthDate } from "@/lib/numerology/constants";

const MATRIX_HREF = "/numerology/destiny-matrix";
const FULL_SESSION_HREF = "/?numerolog=1&tool=destiny_matrix";

type HomeDestinyMatrixBannerProps = {
  isLoggedIn?: boolean;
  /** Prefer direct session open over URL deep-link when parent can handle it. */
  onOpenWithEvelina?: () => void;
};

function toIsoDate(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const parsed = parseBirthDate(raw.trim());
  if (!parsed) return null;
  return `${parsed.year}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

/** Homepage promo — matrix is the lightest product entry (date → free preview). */
export default function HomeDestinyMatrixBanner({
  isLoggedIn = false,
  onOpenWithEvelina,
}: HomeDestinyMatrixBannerProps) {
  const [owned, setOwned] = useState(false);

  useEffect(() => {
    if (!isLoggedIn) {
      setOwned(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      let birthDate = toIsoDate(readStoredProfile()?.birthDate);
      try {
        const profileRes = await fetch("/api/profile", { credentials: "include" });
        if (profileRes.ok) {
          const data = (await profileRes.json()) as {
            profile?: { birthDate?: string } | null;
          };
          birthDate = toIsoDate(data.profile?.birthDate) ?? birthDate;
        }
      } catch {
        /* keep local */
      }
      if (!birthDate || cancelled) return;
      try {
        const res = await fetch(
          `/api/numerology/matrix-report?birthDate=${encodeURIComponent(birthDate)}`,
          { credentials: "include" }
        );
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { owned?: boolean };
        if (!cancelled) setOwned(Boolean(data.owned));
      } catch {
        if (!cancelled) setOwned(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoggedIn]);

  const openPreview = () => {
    window.location.assign(MATRIX_HREF);
  };

  const openWithEvelina = () => {
    if (onOpenWithEvelina) {
      onOpenWithEvelina();
      return;
    }
    // Full navigation so HomePage deep-link effect re-runs (soft Link to /?… is a no-op).
    window.location.assign(FULL_SESSION_HREF);
  };

  return (
    <section className="ritual-cta-banner" aria-labelledby="home-destiny-matrix-title">
      <div className="ritual-cta-banner__inner">
        <span className="ritual-cta-banner__icon" aria-hidden>
          <Hexagon className="h-6 w-6 text-amber-200" strokeWidth={1.5} />
        </span>
        <div className="ritual-cta-banner__copy">
          <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-amber-400/80">
            По дате рождения
          </p>
          <h2 id="home-destiny-matrix-title" className="ritual-cta-banner__title">
            Матрица судьбы
          </h2>
          <p className="ritual-cta-banner__text">
            Одна дата — и на экране схема с ключевыми энергиями. Расчёт бесплатный, без анкеты и
            регистрации.
          </p>
          <p className="mt-1 text-xs text-white/40">
            {owned
              ? "Полный разбор уже открыт — повторно платить не нужно"
              : `Схема бесплатно · разбор с Эвелиной — ${PRICING.NUMEROLOGY_SESSION} ᚢ один раз`}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <button
            type="button"
            onClick={openPreview}
            className="btn-luxe btn-luxe--md btn-luxe--gold ritual-cta-banner__btn"
          >
            Рассчитать бесплатно
          </button>
          {isLoggedIn ? (
            <button
              type="button"
              onClick={openWithEvelina}
              className="btn-luxe btn-luxe--md btn-luxe--ghost ritual-cta-banner__btn"
            >
              {owned ? "Открыть разбор" : "С Эвелиной"}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
