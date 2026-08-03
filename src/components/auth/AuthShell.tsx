"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

type AuthShellProps = {
  children: ReactNode;
  /** Optional quiet link above the card (e.g. back to account picker). */
  backSlot?: ReactNode;
  className?: string;
};

/** Centered salon card with soft vignette — presentation only. */
export default function AuthShell({ children, backSlot, className = "" }: AuthShellProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div className={`auth-salon-page ${className}`.trim()}>
      <div className="auth-salon-vignette" aria-hidden />
      <div className="auth-salon-inner">
        {backSlot ? <div className="auth-salon-back">{backSlot}</div> : null}
        <motion.div
          className="auth-salon-card"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={
            reduceMotion
              ? { duration: 0 }
              : { duration: 0.22, ease: [0.22, 1, 0.36, 1] }
          }
        >
          {children}
        </motion.div>
      </div>
    </div>
  );
}

type AuthSalonHeaderProps = {
  overline?: string;
  title: string;
  subtitle?: string;
};

export function AuthSalonHeader({
  overline = "Приватный цифровой салон",
  title,
  subtitle,
}: AuthSalonHeaderProps) {
  return (
    <header className="auth-salon-header">
      {overline ? <p className="auth-salon-overline">{overline}</p> : null}
      <h1 className="auth-salon-title">{title}</h1>
      {subtitle ? <p className="auth-salon-subtitle">{subtitle}</p> : null}
    </header>
  );
}
