"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useMemo } from "react";
import {
  buildLoginHref,
  buildRegisterHref,
  readPostAuthReturnTo,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";
import { trackRegistrationCtaClick } from "@/lib/seo/metrika";

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
  const registerHref = buildRegisterHref(destination);
  const loginHref = buildLoginHref(destination);

  return (
    <motion.section
      className={`mx-auto text-center ${compact ? "max-w-md" : "max-w-xl"}`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="premium-card overflow-hidden p-px">
        <div className={`relative bg-aura-bg/95 ${compact ? "px-8 py-10" : "px-10 py-14 md:px-14 md:py-16"}`}>
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_50%_0%,rgba(168,85,247,0.12),transparent)]" />
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

            <div className="flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                href={registerHref}
                onClick={() => trackRegistrationCtaClick(source)}
                className="btn-neon inline-flex items-center justify-center px-8 py-3.5 text-sm font-medium"
              >
                Создать аккаунт
              </Link>
              <Link
                href={loginHref}
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-8 py-3.5 text-sm text-gray-300 transition-all hover:border-aura-purple/40 hover:bg-white/[0.06] hover:text-white"
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
