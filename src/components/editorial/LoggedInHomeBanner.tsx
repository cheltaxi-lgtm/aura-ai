"use client";

import EditorialImage from "@/components/editorial/EditorialImage";

type LoggedInHomeBannerProps = {
  userName?: string | null;
};

export default function LoggedInHomeBanner({ userName }: LoggedInHomeBannerProps) {
  const greetingName = userName?.trim().replace(/\s+/g, " ").split(/\s+/)[0] || "";

  return (
    <section
      className="editorial-hero editorial-hero--logged-in"
      aria-labelledby="logged-in-home-banner-title"
    >
      <div className="editorial-hero__media" aria-hidden>
        <EditorialImage
          src="/landing/hero.jpg"
          alt=""
          priority
          className="editorial-hero__img"
        />
        <div className="editorial-hero__overlay" />
      </div>
      <div className="editorial-hero__content">
        <p className="editorial-hero__eyebrow">Ваше пространство</p>
        <h2 id="logged-in-home-banner-title" className="editorial-hero__title">
          {greetingName ? (
            <>
              С возвращением,{" "}
              <span className="editorial-hero__title-name">{greetingName}</span>
            </>
          ) : (
            "С возвращением"
          )}
        </h2>
        <p className="editorial-hero__subtitle">
          Мастера, расклады и личные разборы — в одном пространстве.
        </p>
      </div>
    </section>
  );
}
