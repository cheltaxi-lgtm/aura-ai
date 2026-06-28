import LegalDocLink from "@/components/legal/LegalDocLink";

interface LegalOfferNoticeProps {
  className?: string;
}

export default function LegalOfferNotice({ className = "" }: LegalOfferNoticeProps) {
  return (
    <p className={`text-center text-[11px] leading-relaxed text-gray-500 ${className}`.trim()}>
      Нажимая кнопку оплаты, вы соглашаетесь с условиями{" "}
      <LegalDocLink
        href="/offer"
        className="text-aura-champagne/80 underline underline-offset-2 hover:text-aura-champagne"
      >
        Публичной оферты
      </LegalDocLink>
      .
    </p>
  );
}
