"use client";

import Image from "next/image";

interface DeckGalleryFaceProps {
  name: string;
  imagePath: string;
  onClick?: () => void;
  hideLabel?: boolean;
  unoptimized?: boolean;
  onImageLoad?: () => void;
  onImageError?: () => void;
}

/** Uniform gallery tile — full art visible, fixed aspect, readable label below. */
export default function DeckGalleryFace({
  name,
  imagePath,
  onClick,
  hideLabel = false,
  unoptimized,
  onImageLoad,
  onImageError,
}: DeckGalleryFaceProps) {
  const useUnoptimized = unoptimized ?? imagePath.startsWith("/decks/");
  const inner = (
    <>
      <div className="deck-gallery-face__frame">
        <Image
          src={imagePath}
          alt={name}
          width={533}
          height={800}
          sizes="(max-width: 768px) 33vw, 150px"
          unoptimized={useUnoptimized}
          className="deck-gallery-face__img"
          onLoad={onImageLoad}
          onError={onImageError}
        />
      </div>
      {!hideLabel && <p className="deck-gallery-face__name">{name}</p>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="deck-gallery-face group"
        aria-label={`Открыть ${name}`}
      >
        {inner}
      </button>
    );
  }

  return <div className="deck-gallery-face">{inner}</div>;
}
