"use client";

import { Gift } from "lucide-react";
import { GUEST_SPREAD_SECTION_ID } from "@/lib/landing-offer";
import { buildRegisterHref, resolveRegistrationReturnTo } from "@/lib/post-auth-return";

type EditorialStarterPackSectionProps = {
  onOpenFreeSpread?: () => void;
};

export default function EditorialStarterPackSection({ onOpenFreeSpread }: EditorialStarterPackSectionProps) {
  const registerHref = buildRegisterHref(resolveRegistrationReturnTo());

  return (
    <section id={GUEST_SPREAD_SECTION_ID} className="editorial-starter-pack scroll-mt-24" aria-labelledby="editorial-starter-pack-title">
      <div className="editorial-landing__inner">
        <div className="editorial-starter-pack__card">
          <div className="editorial-starter-pack__glow" aria-hidden />
          <div className="editorial-starter-pack__grid">
            <div className="editorial-starter-pack__visual" aria-hidden>
              <div className="editorial-starter-pack__rune-ring">
                <span className="editorial-starter-pack__rune-glyph">ᚢ</span>
              </div>
            </div>

            <div className="editorial-starter-pack__copy">
              <p className="editorial-starter-pack__eyebrow">
                <Gift className="h-3.5 w-3.5" aria-hidden />
                Стартовый пакет
              </p>
              <h2 id="editorial-starter-pack-title" className="editorial-starter-pack__title">
                Стартовый подарок 1 500 ₽ на ваши расклады
              </h2>
              <p className="editorial-starter-pack__subtitle">
                Зарегистрируйтесь — бонус сразу на балансе. Хватит на полные расшифровки, расклады с мастером
                и первые вопросы в чате.
              </p>
              <ul className="editorial-starter-pack__perks">
                <li>Полная расшифровка расклада у выбранного мастера</li>
                <li>Сохранение истории и продолжение диалога в кабинете</li>
                <li>Доступ к платным практикам без срочной оплаты картой</li>
              </ul>
              <div className="editorial-starter-pack__actions">
                <a href={registerHref} className="editorial-btn editorial-btn--gold editorial-starter-pack__cta-primary">
                  Зарегистрироваться и получить
                </a>
                {onOpenFreeSpread ? (
                  <button type="button" className="editorial-btn editorial-btn--ghost" onClick={onOpenFreeSpread}>
                    Сначала открыть 3 карты
                  </button>
                ) : null}
              </div>
              <p className="editorial-starter-pack__fine">18+ · развлекательно-ознакомительный сервис</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
