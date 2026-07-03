"use client";

import Link from "next/link";
import { Camera, Grid3X3, Sparkles } from "lucide-react";
import { buildPhotoMarkUrl, buildPhotoReadingUrl } from "@/lib/spread-intents/router";

export interface OfflineSpreadBlockProps {
  onOpenPhoto?: () => void;
  onOpenMarkCards?: () => void;
  photoCostLabel?: string;
}

export default function OfflineSpreadBlock({
  onOpenPhoto,
  onOpenMarkCards,
  photoCostLabel,
}: OfflineSpreadBlockProps) {
  const photoHref = buildPhotoReadingUrl();
  const markHref = buildPhotoMarkUrl();

  const handlePhoto = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenPhoto) return;
    event.preventDefault();
    onOpenPhoto();
  };

  const handleMark = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!onOpenMarkCards) return;
    event.preventDefault();
    onOpenMarkCards();
  };

  return (
    <section className="offline-spread" aria-labelledby="offline-spread-title">
      <div className="offline-spread__panel">
        <p className="offline-spread__eyebrow">Уже разложили дома?</p>
        <h2 id="offline-spread-title" className="offline-spread__title">
          Фото или отметка карт — без нового расклада в приложении
        </h2>
        <p className="offline-spread__subtitle">
          Сфотографируйте расклад с вашей колоды или отметьте выпавшие карты вручную — мастер
          расшифрует результат{photoCostLabel ? ` · ${photoCostLabel}` : ""}.
        </p>
        <div className="offline-spread__actions">
          <Link
            href={photoHref}
            onClick={handlePhoto}
            className="offline-spread__cta offline-spread__cta--gold"
          >
            <Camera className="h-4 w-4" aria-hidden />
            Загрузить фото
          </Link>
          <Link
            href={markHref}
            onClick={handleMark}
            className="offline-spread__cta offline-spread__cta--ghost"
          >
            <Grid3X3 className="h-4 w-4" aria-hidden />
            Отметить карты
          </Link>
          <Link href="/photo-rasklad" className="offline-spread__cta offline-spread__cta--link">
            <Sparkles className="h-4 w-4" aria-hidden />
            Как это работает
          </Link>
        </div>
      </div>
    </section>
  );
}
