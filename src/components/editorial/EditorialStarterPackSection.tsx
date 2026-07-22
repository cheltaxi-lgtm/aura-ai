"use client";

import { Gift } from "lucide-react";
import { GUEST_SPREAD_SECTION_ID } from "@/lib/landing-offer";
import { buildRegisterHref, resolveRegistrationReturnTo } from "@/lib/post-auth-return";

type EditorialStarterPackSectionProps = {
  onOpenFreeSpread?: () => void;
};

export default function EditorialStarterPackSection({ onOpenFreeSpread }: EditorialStarterPackSectionProps) {
  const registerHref = buildRegisterHref(resolveRegistrationReturnTo({ guestSpread: true }));

  return (
    <section
      id={GUEST_SPREAD_SECTION_ID}
      className="editorial-starter-pack scroll-mt-24"
      aria-labelledby="editorial-starter-pack-title"
    >
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
                После входа
              </p>
              <h2 id="editorial-starter-pack-title" className="editorial-starter-pack__title">
                После входа — полный разбор
              </h2>
              <p className="editorial-starter-pack__subtitle">
                Сохраните расклад, получите связную расшифровку в чате и стартовые руны ᚢ на баланс —
                хватит на полный разбор и первые уточнения.
              </p>
              <ul className="editorial-starter-pack__perks">
                <li>Полный разбор именно тех карт, что уже открыты</li>
                <li>История сеансов сохраняется в кабинете</li>
                <li>Можно продолжить практику без срочной оплаты картой</li>
              </ul>
              <div className="editorial-starter-pack__actions">
                <a href={registerHref} className="editorial-btn editorial-btn--gold editorial-starter-pack__cta-primary">
                  Войти и получить разбор
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
