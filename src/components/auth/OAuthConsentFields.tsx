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
  /** Server/client age gate already recorded — keep legal true, skip a second checkbox. */
  ageConfirmedLocked?: boolean;
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
  ageConfirmedLocked = false,
  termsId = "oauth-terms-consent",
  ageId = "oauth-age-consent",
  className = "",
}: OAuthConsentFieldsProps) {
  return (
    <div className={`auth-salon-consent ${className}`.trim()}>
      <label htmlFor={termsId}>
        <input
          id={termsId}
          type="checkbox"
          checked={acceptedTerms}
          onChange={(e) => onAcceptedTermsChange(e.target.checked)}
        />
        <span>
          Я согласен с{" "}
          <a href="/terms" target="_blank" rel="noopener noreferrer">
            Пользовательским соглашением
          </a>{" "}
          и{" "}
          <a href="/privacy" target="_blank" rel="noopener noreferrer">
            Политикой обработки персональных данных
          </a>
          {showDisclaimer ? (
            <>
              . Ознакомлен с{" "}
              <a href="/disclaimer" target="_blank" rel="noopener noreferrer">
                отказом от ответственности
              </a>
            </>
          ) : null}
        </span>
      </label>

      {ageConfirmedLocked ? (
        <p className="text-sm leading-relaxed text-aura-ivory/55">Возраст 18+ подтверждён</p>
      ) : (
        <label htmlFor={ageId}>
          <input
            id={ageId}
            type="checkbox"
            checked={ageConfirmed}
            onChange={(e) => onAgeConfirmedChange(e.target.checked)}
          />
          <span>Мне есть 18 лет</span>
        </label>
      )}

      {showMarketing ? (
        <label>
          <input
            type="checkbox"
            checked={marketingConsent}
            onChange={(e) => onMarketingConsentChange(e.target.checked)}
          />
          <span>Я согласен на получение рекламных рассылок</span>
        </label>
      ) : null}
    </div>
  );
}
