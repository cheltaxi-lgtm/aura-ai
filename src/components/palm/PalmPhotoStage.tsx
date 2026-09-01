"use client";

export default function PalmPhotoStage({
  src,
  alt = "Ваша ладонь",
  compact = false,
  showFrame = false,
}: {
  src: string;
  alt?: string;
  compact?: boolean;
  showFrame?: boolean;
}) {
  return (
    <div className={`palm-photo-stage${compact ? " palm-photo-stage--compact" : ""}`}>
      {/* Session-only object URL. The photo is never persisted on the server. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} />
      {showFrame ? (
        <div className="palm-photo-stage__corners" aria-hidden>
          <span />
          <span />
          <span />
          <span />
        </div>
      ) : null}
    </div>
  );
}
