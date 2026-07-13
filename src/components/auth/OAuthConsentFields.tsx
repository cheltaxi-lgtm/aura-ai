"use client";

type OAuthConsentFieldsProps = {
  acceptedTerms: boolean;
  ageConfirmed: boolean;
  marketingConsent: boolean;
  onAcceptedTermsChange: (value: boolean) => void;
  onAgeConfirmedChange: (value: boolean) => void;
  onMarketingConsentChange: (value: boolean) => void;
  showMarketing?: boolean;
  showDisclaimer?: boolean;
  termsId?: string;
  ageId?: string;
  className?: string;
};

export default function OAuthConsentFields({
  acceptedTerms,
  ageConfirmed,
  marketingConsent,
  onAcceptedTermsChange,
  onAgeConfirmedChange,
  onMarketingConsentChange,
  showMarketing = true,
  showDisclaimer = false,
  termsId = "oauth-terms-consent",
  ageId = "oauth-age-consent",
  className = "",
}: OAuthConsentFieldsProps) {
  return (
    <div className={`space-y-3 text-left ${className}`.trim()}>
      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-aura-ivory/70">
        <input
          id={termsId}
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => onAcceptedTermsChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
        />
        <span>
          Я согласен с{" "}
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="text-aura-champagne/90 underline underline-offset-2 hover:text-aura-champagne"
          >
            Пользовательским соглашением
          </a>{" "}
          и{" "}
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="text-aura-champagne/90 underline underline-offset-2 hover:text-aura-champagne"
          >
            Политикой обработки персональных данных
          </a>
          {showDisclaimer ? (
            <>
              . Ознакомлен с{" "}
              <a
                href="/disclaimer"
                target="_blank"
                rel="noopener noreferrer"
                className="text-aura-champagne/90 underline underline-offset-2 hover:text-aura-champagne"
              >
                отказом от ответственности
              </a>
            </>
          ) : null}
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-aura-ivory/70">
        <input
          id={ageId}
          type="checkbox"
          checked={ageConfirmed}
          onChange={(e) => onAgeConfirmedChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
        />
        <span>Мне есть 18 лет</span>
      </label>

      {showMarketing ? (
        <label className="flex cursor-pointer items-start gap-2.5 text-xs leading-relaxed text-aura-ivory/55">
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(e) => onMarketingConsentChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-transparent"
          />
          <span>Я согласен на получение рекламных рассылок</span>
        </label>
      ) : null}
    </div>
  );
}
