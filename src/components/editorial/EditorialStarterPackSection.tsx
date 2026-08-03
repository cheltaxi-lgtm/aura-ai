"use client";

import Link from "next/link";
import { useScrollReveal } from "@/hooks/useScrollReveal";
import { GUEST_SPREAD_SECTION_ID } from "@/lib/landing-offer";
import { buildLoginHref, resolveRegistrationReturnTo } from "@/lib/post-auth-return";
import RuneIcon from "@/components/RuneIcon";

type EditorialStarterPackSectionProps = {
  onOpenFreeSpread?: () => void;
};

export default function EditorialStarterPackSection({ onOpenFreeSpread }: EditorialStarterPackSectionProps) {
  const loginHref = buildLoginHref(resolveRegistrationReturnTo({ guestSpread: true }));
  const { ref, className } = useScrollReveal<HTMLElement>();

  return (
    <section
      ref={ref}
      id={GUEST_SPREAD_SECTION_ID}
      className={`editorial-starter-pack scroll-mt-24 ${className}`}
      aria-labelledby="editorial-starter-pack-title"
    >
      <div className="editorial-landing__inner">
        <div className="editorial-starter-pack__card salon-reveal__item" style={{ ["--salon-i" as string]: 0 }}>
          <div className="editorial-starter-pack__glow" aria-hidden />
          <div className="editorial-starter-pack__grid">
            <div className="editorial-starter-pack__visual" aria-hidden>
              <div className="editorial-starter-pack__rune-ring">
                <RuneIcon className="editorial-starter-pack__rune-glyph h-10 w-7" />
              </div>
            </div>

            <div className="editorial-starter-pack__copy">
              <p className="editorial-starter-pack__eyebrow">После входа</p>
              <h2 id="editorial-starter-pack-title" className="editorial-starter-pack__title">
                Полный разбор именно этих карт
              </h2>
              <p className="editorial-starter-pack__subtitle">
                Не новый расклад — те же три карты, полностью.
              </p>
              <ul className="editorial-starter-pack__perks">
                <li>
                  Стартовые руны <RuneIcon className="inline-block h-[0.95em] w-[0.65em] align-[-0.1em]" /> на
                  балансе — хватит на разбор и первые уточнения
                </li>
                <li>История сеансов сохраняется в кабинете</li>
                <li>Карту привязывать не нужно</li>
              </ul>
              <div className="editorial-starter-pack__actions">
                {onOpenFreeSpread ? (
                  <button
                    type="button"
                    className="editorial-btn editorial-btn--gold editorial-starter-pack__cta-primary"
                    onClick={onOpenFreeSpread}
                  >
                    Открыть 3 карты
                  </button>
                ) : null}
                <Link href={loginHref} className="editorial-btn editorial-btn--ghost">
                  Войти
                </Link>
              </div>
              <p className="editorial-starter-pack__fine">уже есть аккаунт · 18+</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
