"use client";

import Link from "next/link";
import RuneIcon from "@/components/RuneIcon";

export default function LandingHonestSection() {
  return (
    <section className="landing-honest scroll-mt-24" aria-labelledby="landing-honest-title">
      <div className="editorial-landing__inner">
        <header className="landing-honest__head">
          <h2 id="landing-honest-title" className="landing-honest__title">
            Честно о сервисе
          </h2>
          <p className="landing-honest__subtitle">Чтобы вы решали, а не догадывались.</p>
        </header>
        <div className="landing-honest__grid">
          <article className="landing-honest__card">
            <h3 className="landing-honest__card-title">Наставники — это ИИ</h3>
            <p className="landing-honest__card-text">
              Не «потомственные тарологи». Языковые модели в художественных образах: традиция, манера
              речи и логика разбора — авторские, собеседник — ИИ. Мы пишем это на первом экране, а не в
              сноске под кнопкой оплаты.
            </p>
          </article>
          <article className="landing-honest__card">
            <h3 className="landing-honest__card-title">Бесплатное — правда бесплатное</h3>
            <p className="landing-honest__card-text">
              Три карты и смысл символов открываются без аккаунта и без карты. Регистрация нужна для
              полного разбора и истории — не для того, чтобы взять оплату.
            </p>
          </article>
          <article className="landing-honest__card">
            <h3 className="landing-honest__card-title">Списание только по вашему действию</h3>
            <p className="landing-honest__card-text">
              Сеансы идут в рунах <RuneIcon className="inline-block h-[0.95em] w-[0.65em] align-[-0.1em]" />
              , которые вы пополняете сами. Платное действие списывается только после вашего
              подтверждения. Курс и прайс открыты в{" "}
              <Link href="/#тарифы" className="landing-honest__link">
                разделе тарифов
              </Link>
              .
            </p>
          </article>
        </div>
        <p className="landing-honest__legal">
          Развлекательно-ознакомительный сервис 18+. Не заменяет медицинские, юридические и иные
          профессиональные консультации.
        </p>
      </div>
    </section>
  );
}
