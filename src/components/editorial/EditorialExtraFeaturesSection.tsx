"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import EditorialImage from "@/components/editorial/EditorialImage";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { useRuneConfig } from "@/lib/useRuneConfig";
import { buildAuthHref, buildRegisterHref, resolveRegistrationReturnTo } from "@/lib/post-auth-return";

/**
 * Guest landing extra formats — PhotoTarot and Numerology only.
 * Display-only rune math from the live server config. Never invents
 * starter amounts or «бесплатно» before fromServer is true.
 */
export default function EditorialExtraFeaturesSection() {
  const { ref, className } = useScrollReveal<HTMLElement>();
  const { config, fromServer } = useRuneConfig();
  const starter = config.starterRunes;
  const photoCost = config.costs.VISION_ANALYSIS;
  const numerologyCost = config.costs.NUMEROLOGY_SESSION;
  const photoReady = fromServer && starter > 0 && photoCost > 0;
  const numerologyReady = fromServer && starter > 0 && numerologyCost > 0;
  const photoFree = photoReady && starter >= photoCost;
  const numerologyFree = numerologyReady && starter >= numerologyCost;
  const [photoHref, setPhotoHref] = useState(() => buildAuthHref("/auth/user/register", "/?photo=1"));
  useEffect(() => {
    setPhotoHref(buildRegisterHref(resolveRegistrationReturnTo({ photo: true })));
  }, []);

  return (
    <section
      ref={ref}
      className={`editorial-section editorial-extra-features ${className} salon-reveal--stagger`}
      aria-label="ФотоТаро и нумерология"
    >
      <div className="editorial-landing__inner">
        <article
          className="editorial-extra-feature salon-reveal__item"
          style={{ ["--salon-i" as string]: 0 }}
        >
          <div className="editorial-extra-feature__media">
            <EditorialImage
              src="/landing/practices/photo-tarot.jpg"
              alt=""
              className="editorial-extra-feature__img"
            />
          </div>
          <div className="editorial-extra-feature__copy">
            <p className="editorial-extra-feature__eyebrow">ФотоТаро</p>
            <h2 className="editorial-extra-feature__title">Уже разложили карты сами?</h2>
            <p className="editorial-extra-feature__text">
              Загрузите фотографию расклада — Zovus поможет разобрать каждую позицию, сочетание
              карт и общий смысл.
            </p>
            {photoFree ? (
              <div className="editorial-extra-feature__offer">
                <p className="editorial-extra-feature__offer-lead">
                  Для нового пользователя — бесплатно на стартовые руны
                </p>
                <p className="editorial-extra-feature__offer-note">
                  При первой регистрации — {starter} ᚢ · ФотоТаро — {photoCost} ᚢ
                </p>
              </div>
            ) : photoReady ? (
              <div className="editorial-extra-feature__offer">
                <p className="editorial-extra-feature__offer-lead">
                  При первой регистрации — {starter} ᚢ
                </p>
                <p className="editorial-extra-feature__offer-note">
                  Стартовые руны покроют часть стоимости {photoCost} ᚢ
                </p>
              </div>
            ) : null}
            <Link href={photoHref} className="editorial-btn editorial-btn--gold">
              {photoFree ? "Попробовать ФотоТаро бесплатно" : "Открыть ФотоТаро"}
            </Link>
          </div>
        </article>

        <article
          className="editorial-extra-feature editorial-extra-feature--reverse salon-reveal__item"
          style={{ ["--salon-i" as string]: 1 }}
        >
          <div className="editorial-extra-feature__media">
            <EditorialImage
              src="/landing/practices/numerology.jpg"
              alt=""
              className="editorial-extra-feature__img"
            />
          </div>
          <div className="editorial-extra-feature__copy">
            <p className="editorial-extra-feature__eyebrow">Нумерология</p>
            <h2 className="editorial-extra-feature__title">Посмотрите, что говорит дата рождения</h2>
            <p className="editorial-extra-feature__text">
              Числа пути, квадрат Пифагора, личные циклы и другие расчёты — в одном разделе Zovus.
            </p>
            {numerologyFree ? (
              <div className="editorial-extra-feature__offer">
                <p className="editorial-extra-feature__offer-lead">
                  Для нового пользователя — бесплатно на стартовые руны
                </p>
                <p className="editorial-extra-feature__offer-note">
                  При первой регистрации — {starter} ᚢ · полный разбор — {numerologyCost} ᚢ
                </p>
              </div>
            ) : numerologyReady ? (
              <div className="editorial-extra-feature__offer">
                <p className="editorial-extra-feature__offer-lead">
                  При первой регистрации — {starter} ᚢ
                </p>
                <p className="editorial-extra-feature__offer-note">
                  Стартовые руны покроют часть стоимости {numerologyCost} ᚢ
                </p>
              </div>
            ) : null}
            <Link href="/numerology" className="editorial-btn editorial-btn--gold">
              {numerologyFree ? "Попробовать бесплатно" : "Открыть нумерологию"}
            </Link>
          </div>
        </article>
      </div>
    </section>
  );
}
