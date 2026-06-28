import { LEGAL_OPERATOR, LEGAL_PAYMENT_DETAILS } from "@/lib/legal-operator";

interface LegalOperatorBlockProps {
  showPaymentDetails?: boolean;
}

export default function LegalOperatorBlock({
  showPaymentDetails = false,
}: LegalOperatorBlockProps) {
  return (
    <div className="legal-prose-emphasis space-y-3">
      <p className="!mt-0">
        <strong>{LEGAL_OPERATOR.displayName}</strong>
        <br />
        {LEGAL_OPERATOR.status}
        <br />
        ИНН: {LEGAL_OPERATOR.inn}
        <br />
        Сайт:{" "}
        <a href={LEGAL_OPERATOR.siteUrl} target="_blank" rel="noopener noreferrer">
          {LEGAL_OPERATOR.siteUrl}
        </a>
        <br />
        Регион: {LEGAL_OPERATOR.region}
      </p>
      <p className="!mt-0 text-sm">
        Email:{" "}
        <a href={`mailto:${LEGAL_OPERATOR.contactEmail}`}>{LEGAL_OPERATOR.contactEmail}</a>
      </p>
      {showPaymentDetails ? (
        <div>
          <p className="!mt-0 font-semibold text-white/90">Платёжные реквизиты</p>
          <ul className="!mt-2 space-y-1 text-sm">
            {LEGAL_PAYMENT_DETAILS.map((row) => (
              <li key={row.label}>
                <strong>{row.label}:</strong> {row.value}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
