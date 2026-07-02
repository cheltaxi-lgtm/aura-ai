import LegalDocLink from "@/components/legal/LegalDocLink";
import { BRAND_NAME } from "@/lib/brand";
import { LEGAL_OPERATOR, operatorShortLabel } from "@/lib/legal-operator";
import { SITE_FOOTER_LEGAL_LINE } from "@/lib/master-disclosure";

export default function SiteFooter() {
  return (
    <footer className="site-legal-footer relative mt-auto">
      <nav className="site-legal-footer__links" aria-label="Юридические документы">
        <span className="site-legal-footer__brand">© {BRAND_NAME}</span>
        <span className="site-legal-footer__operator">{operatorShortLabel()}</span>
        <LegalDocLink href={`mailto:${LEGAL_OPERATOR.contactEmail}`} className="site-legal-footer__email">
          {LEGAL_OPERATOR.contactEmail}
        </LegalDocLink>
        <LegalDocLink href="/privacy">ПДн</LegalDocLink>
        <LegalDocLink href="/terms">Соглашение</LegalDocLink>
        <LegalDocLink href="/offer">Оферта</LegalDocLink>
        <LegalDocLink href="/disclaimer">Отказ</LegalDocLink>
        <LegalDocLink href="/app">Приложение</LegalDocLink>
      </nav>
      <p className="site-legal-footer__tagline" role="note">
        {SITE_FOOTER_LEGAL_LINE}{" "}
        <LegalDocLink href="/disclaimer" className="text-aura-ivory/55 hover:text-aura-champagne">
          Подробнее
        </LegalDocLink>
      </p>
    </footer>
  );
}
