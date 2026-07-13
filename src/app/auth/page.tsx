"use client";

import BrandLogo from "@/components/BrandLogo";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Sparkles, Compass, ArrowRight } from "lucide-react";
import { usePlatformFeatures } from "@/lib/usePlatformFeatures";
import {
  buildLoginHref,
  buildRegisterHref,
  captureReturnToFromUrl,
  readPostAuthReturnTo,
  resolveRegistrationReturnTo,
} from "@/lib/post-auth-return";

const CARD_STAGGER = 0.1;

function RoleCard({
  icon: Icon,
  title,
  description,
  accent,
  loginHref,
  registerHref,
  showRegister = true,
  delay,
}: {
  icon: typeof Compass;
  title: string;
  description: string;
  accent: "violet" | "gold";
  loginHref: string;
  registerHref: string;
  showRegister?: boolean;
  delay: number;
}) {
  const isGold = accent === "gold";

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className={`group relative flex flex-col overflow-hidden rounded-3xl border p-7 sm:p-8 ${
        isGold
          ? "border-aura-gold/25 bg-gradient-to-b from-aura-gold/[0.08] to-black/40"
          : "border-aura-purple/25 bg-gradient-to-b from-aura-purple/15 to-black/40"
      }`}
      style={{ boxShadow: "var(--shadow-lux)" }}
    >
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full blur-3xl ${
          isGold ? "bg-aura-gold/15" : "bg-aura-purple/20"
        }`}
      />

      <div
        className={`relative mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl border ${
          isGold
            ? "border-aura-gold/35 bg-aura-gold/10"
            : "border-aura-purple/35 bg-aura-purple/15"
        }`}
      >
        <Icon
          className={`h-8 w-8 ${isGold ? "text-aura-gold" : "text-aura-neon"}`}
          strokeWidth={1.5}
        />
      </div>

      <h2 className="font-display relative mb-2 text-center text-xl font-semibold text-white">
        {title}
      </h2>
      <p className="relative mb-6 flex-1 text-center text-sm leading-relaxed text-aura-ivory/55">
        {description}
      </p>

      <div className="relative flex flex-col gap-3">
        <Link href={loginHref} className="btn-primary w-full py-3 text-sm font-semibold">
          Войти
          <ArrowRight className="h-4 w-4" />
        </Link>
        {showRegister ? (
          <Link href={registerHref} className="btn-ghost w-full py-2.5 text-sm">
            Создать профиль
          </Link>
        ) : null}
      </div>
    </motion.article>
  );
}

export default function AuthPortalPage() {
  const { expertRegistrationEnabled } = usePlatformFeatures();
  const [userLoginHref, setUserLoginHref] = useState("/auth/user/login");
  const [userRegisterHref, setUserRegisterHref] = useState("/auth/user/register");
  const [expertLoginHref, setExpertLoginHref] = useState("/auth/expert/login");
  const [expertRegisterHref, setExpertRegisterHref] = useState("/auth/expert/register");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = params.get("returnTo") ?? params.get("next");
    captureReturnToFromUrl(window.location.search, "/");
    const userReturn = raw ?? readPostAuthReturnTo() ?? resolveRegistrationReturnTo();
    setUserLoginHref(buildLoginHref(userReturn));
    setUserRegisterHref(buildRegisterHref(userReturn));
    setExpertLoginHref(buildLoginHref("/expert", "/expert"));
    setExpertRegisterHref(buildRegisterHref("/expert", "/expert"));
  }, []);

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-5 py-12">
      <div className="pointer-events-none absolute left-1/2 top-0 h-[420px] w-[640px] -translate-x-1/2 rounded-full bg-aura-purple/10 blur-[100px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-72 rounded-full bg-aura-gold/8 blur-[80px]" />

      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative mb-10 text-center"
      >
        <Link href="/" className="mb-6 inline-block transition-opacity hover:opacity-80">
          <BrandLogo titleClassName="font-display text-2xl font-bold tracking-[0.2em] text-white" />
        </Link>

        <h1 className="font-display lux-heading mb-3 text-3xl font-bold sm:text-4xl">
          Добро пожаловать
        </h1>
        <p className="mx-auto max-w-sm text-sm text-aura-ivory/50">
          Мы помогаем найти ответы — выберите, как вы хотите войти
        </p>
      </motion.div>

      <div className="relative mb-8 w-full max-w-md">
        <div className="lux-divider" />
      </div>

      <div
        className={`relative grid w-full gap-5 sm:gap-6 ${
          expertRegistrationEnabled ? "max-w-2xl sm:grid-cols-2" : "max-w-md"
        }`}
      >
        <RoleCard
          icon={Compass}
          title="Искатель"
          description="Расклады, мастера и личный кабинет — путь к подсказкам и ясности"
          accent="violet"
          loginHref={userLoginHref}
          registerHref={userRegisterHref}
          delay={CARD_STAGGER}
        />
        {expertRegistrationEnabled ? (
          <RoleCard
            icon={Sparkles}
            title="Мастер"
            description="Своя страница, white-label и доход 80% — делитесь знанием с миром"
            accent="gold"
            loginHref={expertLoginHref}
            registerHref={expertRegisterHref}
            delay={CARD_STAGGER * 2}
          />
        ) : null}
      </div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="relative mt-10 space-y-2 text-center text-xs text-aura-ivory/35"
      >
        <Link href="/" className="block transition-colors hover:text-aura-champagne/70">
          ← На главную без входа
        </Link>
        <Link href="/admin/login" className="block transition-colors hover:text-aura-champagne/70">
          Вход для администратора →
        </Link>
      </motion.p>
    </div>
  );
}
