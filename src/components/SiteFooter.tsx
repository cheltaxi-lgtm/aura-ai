import LegalDocLink from "@/components/legal/LegalDocLink";
import { BRAND_NAME } from "@/lib/brand";
import { LEGAL_OPERATOR, operatorShortLabel } from "@/lib/legal-operator";
import { SITE_FOOTER_LEGAL_LINE } from "@/lib/master-disclosure";

export default function SiteFooter() {
  return (
    <footer className="site-legal-footer relative mt-auto">
      <p className="site-legal-footer__tagline" role="note">
        {SITE_FOOTER_LEGAL_LINE}{" "}
        <LegalDocLink href="/disclaimer" className="text-aura-ivory/55 hover:text-aura-champagne">
          Подробнее
        </LegalDocLink>
      </p>
      <nav className="site-legal-footer__links" aria-label="Юридические документы">
        <span className="text-aura-ivory/25">© {BRAND_NAME}</span>
        <span className="text-aura-ivory/25">{operatorShortLabel()}</span>
        <LegalDocLink href={`mailto:${LEGAL_OPERATOR.contactEmail}`}>
          {LEGAL_OPERATOR.contactEmail}
        </LegalDocLink>
        <LegalDocLink href="/privacy">Политика ПДн</LegalDocLink>
        <LegalDocLink href="/terms">Соглашение</LegalDocLink>
        <LegalDocLink href="/offer">Оферта</LegalDocLink>
        <LegalDocLink href="/disclaimer">Отказ от ответственности</LegalDocLink>
      </nav>
    </footer>
  );
}
