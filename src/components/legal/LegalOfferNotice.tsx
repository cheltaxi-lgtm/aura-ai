import LegalDocLink from "@/components/legal/LegalDocLink";

interface LegalOfferNoticeProps {
  className?: string;
}

export default function LegalOfferNotice({ className = "" }: LegalOfferNoticeProps) {
  return (
    <p className={`text-center text-[11px] leading-relaxed text-gray-500 ${className}`.trim()}>
      Нажимая кнопку оплаты, вы соглашаетесь с{" "}
      <LegalDocLink
        href="/offer"
        className="text-aura-champagne/80 underline underline-offset-2 hover:text-aura-champagne"
      >
        Публичной офертой
      </LegalDocLink>
      . Цифровые услуги оказываются сразу после оплаты; возврат за оказанные услуги не
      производится (кроме случаев, указанных в оферте).
    </p>
  );
}
