"use client";

import { useCallback, useRef, useState } from "react";
import { EDITORIAL_SECTION_IDS } from "@/lib/editorial-landing-content";
import PartnerInquiryModal from "@/components/partners/PartnerInquiryModal";

const EXAMPLE_PARTNERS = [
  {
    mark: "СН",
    name: "Ателье колоды «Северная нить»",
    blurb: "Авторские колоды Таро — пилот «колода месяца» в цифровом салоне.",
  },
  {
    mark: "ДБ",
    name: "Дом бумаги и символа",
    blurb: "Офлайн-витрина и QR на гостевой расклад после покупки колоды.",
  },
] as const;

export default function LandingPartnersSection() {
  const [modalOpen, setModalOpen] = useState(false);
  const lastTriggerRef = useRef<HTMLElement | null>(null);

  const openModal = useCallback((el?: HTMLElement | null) => {
    lastTriggerRef.current = el ?? null;
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
  }, []);

  return (
    <section
      id={EDITORIAL_SECTION_IDS.partners}
      className="editorial-partners scroll-mt-24"
      aria-labelledby="editorial-partners-title"
    >
      <div className="editorial-landing__inner">
        <div className="editorial-partners__head">
          <p className="editorial-partners__eyebrow">Партнёрский пилот</p>
          <h2 id="editorial-partners-title" className="editorial-partners__title">
            Ваша колода может стать частью Zovus
          </h2>
          <p className="editorial-partners__lead">
            Сейчас мы приглашаем авторов, издателей и магазины колод к пилоту. Партнёр получает
            отдельное представление колоды в сервисе, ссылку на покупку и возможность вместе с нами
            задать формат интеграции.
          </p>
          <p className="editorial-partners__lead editorial-partners__lead--secondary">
            Для первых партнёров готовы обсуждать приоритетное размещение и индивидуальные условия
            при подтверждённом потоке пользователей.
          </p>
          <button
            type="button"
            className="editorial-btn editorial-btn--gold editorial-partners__cta"
            onClick={(e) => openModal(e.currentTarget)}
          >
            Обсудить пилот
          </button>
        </div>

        <div className="editorial-partners__examples" aria-label="Примеры направлений сотрудничества">
          {EXAMPLE_PARTNERS.map((p) => (
            <article key={p.name} className="editorial-partners__example">
              <span className="editorial-partners__mark" aria-hidden>
                {p.mark}
              </span>
              <div>
                <h3 className="editorial-partners__example-name">{p.name}</h3>
                <p className="editorial-partners__example-blurb">{p.blurb}</p>
              </div>
            </article>
          ))}
          <article className="editorial-partners__example editorial-partners__example--pilot">
            <span className="editorial-partners__mark" aria-hidden>
              П
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="editorial-partners__example-name">Пилот для партнёра</h3>
              <p className="editorial-partners__example-blurb">
                Совместный формат под вашу колоду: аккуратная интеграция в салон и разбор по итогам
                пилота.
              </p>
              <button
                type="button"
                className="editorial-btn editorial-btn--ghost editorial-partners__card-cta"
                onClick={(e) => openModal(e.currentTarget)}
              >
                Стать партнёром
              </button>
            </div>
          </article>
          <p className="editorial-partners__examples-note">Примеры направлений сотрудничества</p>
        </div>

        <div className="editorial-partners__final">
          <p className="editorial-partners__eyebrow">Пилот на запуске</p>
          <h3 className="editorial-partners__final-title">
            Ищем одну-две колоды, с которыми пойдём в долгую
          </h3>
          <p className="editorial-partners__final-text">
            Zovus активно тестируется и дорабатывается, но сервисом уже пользуются. Первым
            постоянным партнёрам — приоритет в пилоте и индивидуальные условия при подтверждённом
            потоке.
          </p>
          <button
            type="button"
            className="editorial-btn editorial-btn--gold editorial-partners__cta"
            onClick={(e) => openModal(e.currentTarget)}
          >
            Обсудить партнёрство
          </button>
        </div>
      </div>

      <PartnerInquiryModal
        open={modalOpen}
        onClose={closeModal}
        returnFocusRef={lastTriggerRef}
      />
    </section>
  );
}
