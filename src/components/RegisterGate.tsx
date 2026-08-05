"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  buildLoginHref,
  buildRegisterHref,
  readPostAuthReturnTo,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import { trackRegistrationCtaClick } from "@/lib/seo/metrika";
import { isAgeGateConfirmed } from "@/lib/age-gate";
import SocialAuthButtons from "@/components/auth/SocialAuthButtons";
import OAuthConsentFields from "@/components/auth/OAuthConsentFields";

interface RegisterGateProps {
  title?: string;
  description?: string;
  compact?: boolean;
  returnTo?: string;
  source?: string;
}

export default function RegisterGate({
  title = "Войдите, чтобы продолжить",
  description = "Бесплатная регистрация — расклад сохранится в личном кабинете, история сеансов всегда под рукой.",
  compact = false,
  returnTo,
  source = "register_gate",
}: RegisterGateProps) {
  const destination = useMemo(
    () => returnTo ?? readPostAuthReturnTo() ?? resolveRegistrationReturnTo({ guestSpread: true }),
    [returnTo]
  );
  const emailRegisterHref = buildRegisterHref(destination, "/", { method: "email" });
  const loginHref = buildLoginHref(destination);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [ageConfirmed, setAgeConfirmed] = useState(() => isAgeGateConfirmed());
  const [marketingConsent, setMarketingConsent] = useState(false);

  return (
    <motion.section
      className={`mx-auto text-center ${compact ? "max-w-md" : "max-w-xl"}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="premium-card overflow-hidden p-px">
        <div className={`relative bg-aura-bg/95 ${compact ? "px-8 py-10" : "px-10 py-14 md:px-14 md:py-16"}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(201,162,74,0.12),transparent)]" />
          <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-aura-gold/5 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-6 -left-6 h-24 w-24 rounded-full bg-aura-emerald/5 blur-2xl" />

          <div className="relative">
            <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center">
              <span className="font-display text-3xl text-aura-gold">✦</span>
            </div>

            <h2 className="font-display mb-3 text-2xl font-semibold tracking-wide text-white md:text-3xl">
              {title}
            </h2>
            <p className="mx-auto mb-8 max-w-sm text-sm leading-relaxed text-gray-400">
              {description}
            </p>

            <div id="register-gate-oauth-consent" className="mb-6 rounded-xl border border-white/8 bg-black/20 p-4 text-left">
              <OAuthConsentFields
                acceptedTerms={acceptedTerms}
                ageConfirmed={ageConfirmed}
                marketingConsent={marketingConsent}
                onAcceptedTermsChange={setAcceptedTerms}
                onAgeConfirmedChange={setAgeConfirmed}
                onMarketingConsentChange={setMarketingConsent}
                termsId="register-gate-terms"
                ageId="register-gate-age"
              />
            </div>

            <SocialAuthButtons
              mode="register"
              returnTo={destination}
              requireConsent
              acceptedTerms={acceptedTerms}
              ageConfirmed={ageConfirmed}
              marketingConsent={marketingConsent}
              consentScrollTargetId="register-gate-oauth-consent"
              showEmailDivider={false}
            />

            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href={emailRegisterHref}
                onClick={() => trackRegistrationCtaClick(source)}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-8 py-3.5 text-sm text-gray-300 transition-all hover:border-aura-gold/40 hover:bg-white/[0.06] hover:text-white"
              >
                Регистрация по email
              </Link>
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-8 py-3.5 text-sm text-gray-300 transition-all hover:border-aura-gold/40 hover:bg-white/[0.06] hover:text-white"
              >
                Войти
              </Link>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
