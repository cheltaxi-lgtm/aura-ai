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
      className="mx-auto mb-14 max-w-3xl text-center"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      <h1 className="font-display mb-6 text-4xl font-bold leading-tight text-white md:text-5xl">
        Витрина мастеров{" "}
        <span className="bg-gradient-to-r from-aura-purple via-aura-emerald to-aura-gold bg-clip-text text-transparent">
          Aura
        </span>
        <span className="mt-2 block text-2xl text-aura-gold md:text-3xl">
          AI + живые эксперты
        </span>
      </h1>

      <p className="mx-auto mb-8 max-w-xl text-lg text-gray-400">
        {masterCount
          ? `${masterCount} мастеров на площадке · расклад · чат · история сеансов`
          : "Расклад таро · чат с мастером · история сеансов"}
      </p>

      {!isLoggedIn && <GuestTripletDraw />}

      <ul className="mx-auto mb-10 max-w-md space-y-3 text-left">
        {bullets.map((text) => (
          <li key={text} className="flex items-start gap-3 text-sm text-gray-300">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-aura-emerald" />
            {text}
          </li>
        ))}
      </ul>

      {isLoggedIn ? (
        <button onClick={onStart} className="btn-neon px-10 py-3.5 text-base">
          Получить расклад
        </button>
      ) : (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/auth/user/register?returnTo=/" className="btn-neon px-10 py-3.5 text-base">
            Зарегистрироваться
          </Link>
          <Link
            href="/auth/user/login?returnTo=/"
            className="text-sm text-gray-500 underline-offset-2 hover:text-aura-neon hover:underline"
          >
            Уже есть аккаунт
          </Link>
        </div>
      )}

      <p className="mt-8 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-gray-600">
        <span className="flex items-center gap-1">
          <Sparkles className="h-3.5 w-3.5 text-aura-purple" />
          Площадка для мастеров и клиентов
        </span>
        <span>·</span>
        <Link
          href="/auth/expert/register"
          className="text-aura-purple/80 underline-offset-2 hover:text-aura-neon hover:underline"
        >
          Стать мастером
        </Link>
      </p>
    </motion.section>
  );
}
