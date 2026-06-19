"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import GuestTripletDraw from "@/components/GuestTripletDraw";
import { Check, Sparkles } from "lucide-react";
import { useRuneConfig } from "@/lib/useRuneConfig";

interface LandingHeroProps {
  isLoggedIn: boolean;
  masterCount?: number;
  onStart: () => void;
}

export default function LandingHero({ isLoggedIn, masterCount, onStart }: LandingHeroProps) {
  const { config, cost, formatRunes } = useRuneConfig();

  const bullets = config.enabled
    ? [
        "Витрина AI-мастеров и живых экспертов — выберите наставника",
        "Расклад из 3 карт — бесплатно, можно открыть прямо здесь",
        `${config.freeQuestions} вопроса мастеру бесплатно, далее — ${formatRunes(cost("QUESTION"))}`,
        `Расшифровка расклада — ${formatRunes(cost("READING"))}, оплата внутренними рунами ᚢ`,
      ]
    : [
        "Витрина AI-мастеров и живых экспертов — выберите своего наставника",
        "Персональный расклад из 3 карт после регистрации",
        "2 вопроса мастеру в чате — бесплатно",
        "История всех сеансов сохраняется в личном кабинете",
      ];

  return (
    <motion.section
      className="lux-hero mx-auto mb-16 max-w-3xl px-4 text-center"
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="lux-hero__glow pointer-events-none" aria-hidden />

      <h1 className="font-display lux-heading mb-6 text-4xl font-bold leading-[1.15] md:text-5xl lg:text-[3.25rem]">
        Витрина мастеров{" "}
        <span className="lux-heading-accent">Aura</span>
        <span className="mt-3 block text-2xl font-medium text-aura-champagne md:text-3xl">
          AI + живые эксперты
        </span>
      </h1>

      <p className="mx-auto mb-10 max-w-xl text-lg font-light leading-relaxed text-aura-ivory/70">
        {masterCount
          ? `${masterCount} мастеров на площадке · расклад · чат · история сеансов`
          : "Расклад таро · чат с мастером · история сеансов"}
      </p>

      {!isLoggedIn && <GuestTripletDraw />}

      <ul className="mx-auto mb-12 max-w-md space-y-4 text-left">
        {bullets.map((text) => (
          <li key={text} className="flex items-start gap-3 text-sm leading-relaxed text-aura-ivory/75">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-aura-champagne" strokeWidth={1.5} />
            {text}
          </li>
        ))}
      </ul>

      {isLoggedIn ? (
        <button onClick={onStart} className="btn-primary px-12 py-4 text-base">
          Получить расклад
        </button>
      ) : (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link href="/auth/user/register?returnTo=/" className="btn-primary px-12 py-4 text-base">
            Зарегистрироваться
          </Link>
          <Link href="/auth/user/login?returnTo=/" className="btn-ghost px-8 py-3.5 text-sm">
            Уже есть аккаунт
          </Link>
        </div>
      )}

      <div className="lux-divider mx-auto my-10 max-w-xs" aria-hidden />

      <p className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-aura-ivory/40">
        <span className="flex items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-aura-champagne/70" strokeWidth={1.5} />
          Площадка для мастеров и клиентов
        </span>
        <span className="hidden sm:inline">·</span>
        <Link
          href="/auth/expert/register"
          className="text-aura-champagne/70 underline-offset-4 transition-colors hover:text-aura-champagne hover:underline"
        >
          Стать мастером
        </Link>
      </p>
    </motion.section>
  );
}
