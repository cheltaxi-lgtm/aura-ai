"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { CreditCard, HelpCircle, MessageCircle, Sparkles, Layers, UserRound, Coins } from "lucide-react";
import { useRuneConfig } from "@/lib/useRuneConfig";
import MasterServiceDisclaimer from "@/components/MasterServiceDisclaimer";

interface RunePackage {
  id: string;
  name: string;
  runes: number;
  price_rub: number;
  bonus_runes: number;
  is_popular: boolean;
}

interface LandingSectionsProps {
  onStartFlow?: () => void;
  onOpenPaywall?: () => void;
  hasSession?: boolean;
  isLoggedIn?: boolean;
}

const HOW_IT_WORKS = [
  {
    icon: UserRound,
    title: "Профиль",
    text: "Имя и дата рождения — карты настроятся на вашу энергию",
  },
  {
    icon: Layers,
    title: "3 карты",
    text: "Откройте Прошлое, Настоящее и Будущее — бесплатно, ещё до регистрации",
  },
  {
    icon: MessageCircle,
    title: "Мастер",
    text: "Расшифровка и чат — за руны ᚢ, первые вопросы бесплатно",
  },
];

export default function LandingSections({
  onStartFlow,
  onOpenPaywall,
  hasSession,
  isLoggedIn,
}: LandingSectionsProps) {
  const { config, cost, formatRunes, formatRunesWithRub } = useRuneConfig();
  const [packages, setPackages] = useState<RunePackage[]>([]);

  useEffect(() => {
    if (!config.enabled) return;
    fetch("/api/runes/packages")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setPackages(d?.packages ?? []))
      .catch(() => undefined);
  }, [config.enabled]);

  const popularPack =
    packages.find((p) => p.is_popular) ?? packages.find((p) => p.id === "adept") ?? packages[0];

  const starterPack = packages.find((p) => p.id === "starter") ?? packages[packages.length - 1];

  const handlePrimaryTariff = () => {
    if (isLoggedIn && onOpenPaywall) onOpenPaywall();
    else onStartFlow?.();
  };

  const readingCost = cost("READING");
  const questionCost = cost("QUESTION");
  const visionCost = cost("VISION_ANALYSIS");
  const freeQ = config.freeQuestions;

  const faqBase = {
    q: "Кто такие мастера на платформе?",
    a: "Консультации оказываются с помощью программных ассистентов. Портреты и имена — художественные образы. Сервис носит развлекательно-ознакомительный характер и не заменяет профессиональные консультации.",
  };

  const faq = config.enabled
    ? [
        faqBase,
        {
          q: "Это правда бесплатно?",
          a: `Да. Расклад из 3 карт на лендинге и ${freeQ} ${freeQ === 1 ? "вопрос" : freeQ < 5 ? "вопроса" : "вопросов"} мастеру — бесплатно. Полная расшифровка у мастера — ${formatRunes(readingCost)}, следующие вопросы — ${formatRunes(questionCost)} каждый.`,
        },
        {
          q: "Что такое руны ᚢ?",
          a: "Внутренняя валюта Zovus. Пополняете баланс пакетами через ЮKassa — руны списываются только за выбранные действия: расшифровку, вопрос, фото-расклад.",
        },
        {
          q: "Как оплатить?",
          a: "СБП или банковская карта через ЮKassa. После оплаты руны зачисляются на баланс автоматически — сеанс продолжается без повторного входа.",
        },
      ]
    : [
        faqBase,
        {
          q: "Это правда бесплатно?",
          a: "Да. Расклад из 3 карт и 2 вопроса мастеру — бесплатно. Полный разбор всех карт — разовая оплата.",
        },
        {
          q: "Сколько вопросов можно задать?",
          a: "2 бесплатных вопроса в чате. С подпиской — безлимит.",
        },
        {
          q: "Как оплатить?",
          a: "СБП, банковская карта или ЮMoney через защищённую оплату ЮKassa.",
        },
      ];

  const packTotal = (p: RunePackage) => p.runes + (p.bonus_runes ?? 0);

  return (
    <>
      <section className="mt-20">
        <h2 className="font-display mb-10 text-center text-2xl font-semibold text-gray-300">
          Как это работает
        </h2>
        <div className="mx-auto grid max-w-4xl gap-6 md:grid-cols-3">
          {HOW_IT_WORKS.map((item, i) => (
            <motion.div
              key={item.title}
              className="glass-panel p-6 text-center"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-aura-purple/20">
                <item.icon className="h-6 w-6 text-aura-neon" />
              </div>
              <h3 className="font-display mb-2 font-semibold text-white">{item.title}</h3>
              <p className="text-sm text-gray-400">{item.text}</p>
            </motion.div>
          ))}
        </div>
      </section>

      <section id="тарифы" className="mt-20 text-center">
        <h2 className="font-display mb-4 text-2xl text-gray-300">
          {config.enabled ? "Руны ᚢ" : "Тарифы"}
        </h2>
        <p className="mb-8 text-sm text-gray-500">
          {config.enabled
            ? `Начните бесплатно — платите рунами только за расшифровку и вопросы · курс ~${config.rubPerRune} ₽ за 1 ᚢ`
            : "Начните бесплатно — платите только за полный доступ"}
        </p>

        {config.enabled ? (
          <>
            <div className="mx-auto mb-6 max-w-lg rounded-xl border border-aura-emerald/25 bg-aura-emerald/5 px-5 py-3 text-sm text-aura-emerald">
              Бесплатно: 3 карты · {freeQ}{" "}
              {freeQ === 1 ? "вопрос" : freeQ < 5 ? "вопроса" : "вопросов"} мастеру
            </div>

            <div className="mx-auto grid max-w-3xl gap-4 sm:grid-cols-2">
              <button
                type="button"
                onClick={handlePrimaryTariff}
                className="glass-panel p-6 text-left transition-all hover:border-aura-purple/40 hover:shadow-neon"
              >
                <div className="mb-2 flex items-center gap-2 text-aura-purple">
                  <Coins className="h-5 w-5" />
                  <span className="text-xs uppercase tracking-widest">За руны</span>
                </div>
                <p className="font-display text-3xl font-bold text-aura-gold">
                  {formatRunes(readingCost)}
                </p>
                <p className="mt-2 text-sm font-medium text-white">Расшифровка расклада</p>
                <ul className="mt-2 space-y-1 text-xs text-gray-400">
                  <li>· Все 3 карты у выбранного мастера</li>
                  <li>
                    · Вопрос в чат: {formatRunes(questionCost)} (после {freeQ} бесплатных)
                  </li>
                  <li>· Фото-расклад: {formatRunes(visionCost)}</li>
                </ul>
                <p className="mt-3 text-[10px] text-gray-600">
                  {formatRunesWithRub(readingCost)} за расшифровку
                </p>
              </button>

              <button
                type="button"
                onClick={handlePrimaryTariff}
                className={`glass-panel relative p-6 text-left transition-all hover:border-aura-gold/40 hover:shadow-neon-gold ${
                  popularPack?.is_popular ? "border-aura-gold/30" : ""
                }`}
              >
                {popularPack?.is_popular && (
                  <span className="absolute -top-2.5 right-4 rounded-full bg-aura-gold/20 px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-aura-gold">
                    Популярный
                  </span>
                )}
                <div className="mb-2 flex items-center gap-2 text-aura-gold">
                  <Sparkles className="h-5 w-5" />
                  <span className="text-xs uppercase tracking-widest">Пакет рун</span>
                </div>
                {popularPack ? (
                  <>
                    <p className="font-display text-3xl font-bold text-aura-gold">
                      {packTotal(popularPack)} ᚢ
                    </p>
                    <p className="mt-2 text-sm font-medium text-white">{popularPack.name}</p>
                    <p className="mt-1 text-xs text-gray-400">
                      {popularPack.runes} ᚢ
                      {popularPack.bonus_runes > 0 ? ` + ${popularPack.bonus_runes} бонус` : ""} ·{" "}
                      {popularPack.price_rub} ₽ · СБП и карты
                    </p>
                    <p className="mt-3 text-[10px] text-gray-600">
                      Хватит на ~{Math.floor(packTotal(popularPack) / readingCost)} расшифровок
                    </p>
                  </>
                ) : (
                  <>
                    <p className="font-display text-3xl font-bold text-aura-gold">от 50 ᚢ</p>
                    <p className="mt-2 text-sm font-medium text-white">Пополнение баланса</p>
                    <p className="mt-1 text-xs text-gray-400">ЮKassa · СБП и карты</p>
                  </>
                )}
              </button>
            </div>

            {starterPack && starterPack.id !== popularPack?.id && (
              <p className="mx-auto mt-4 max-w-md text-xs text-gray-600">
                Есть пакет «{starterPack.name}» — {packTotal(starterPack)} ᚢ за {starterPack.price_rub} ₽
              </p>
            )}

            <button type="button" onClick={handlePrimaryTariff} className="btn-neon mt-8 px-8 py-3 text-sm">
              {isLoggedIn ? "Купить руны" : "Начать и пополнить баланс"}
            </button>
          </>
        ) : (
          <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
            <button
              type="button"
              onClick={handlePrimaryTariff}
              className="glass-panel p-6 text-left transition-all hover:border-aura-purple/40 hover:shadow-neon"
            >
              <p className="font-display text-3xl font-bold text-aura-gold">199 ₽</p>
              <p className="mt-2 text-sm font-medium text-white">Полный разбор</p>
              <p className="mt-1 text-xs text-gray-400">Все 3 карты · 5 вопросов · СБП и карты</p>
            </button>
            <button
              type="button"
              onClick={handlePrimaryTariff}
              className="glass-panel p-6 text-left transition-all hover:border-aura-gold/40 hover:shadow-neon-gold"
            >
              <p className="font-display text-3xl font-bold text-aura-gold">590 ₽/мес</p>
              <p className="mt-2 text-sm font-medium text-white">Zovus+</p>
              <p className="mt-1 text-xs text-gray-400">Безлимит · все 4 мастера</p>
            </button>
          </div>
        )}
      </section>

      <section className="mt-20">
        <h2 className="font-display mb-8 flex items-center justify-center gap-2 text-2xl text-gray-300">
          <HelpCircle className="h-6 w-6 text-aura-purple" />
          Частые вопросы
        </h2>
        <div className="mx-auto max-w-2xl space-y-4">
          {faq.map((item) => (
            <div key={item.q} className="glass-panel p-5 text-left">
              <p className="font-medium text-white">{item.q}</p>
              <p className="mt-2 text-sm text-gray-400">{item.a}</p>
            </div>
          ))}
        </div>
        <MasterServiceDisclaimer className="mx-auto mt-6 max-w-2xl text-center" />
      </section>

      <section className="mt-16 text-center">
        <div className="glass-panel mx-auto inline-flex items-center gap-2 px-6 py-3 text-sm text-gray-500">
          <CreditCard className="h-4 w-4" />
          <Sparkles className="h-4 w-4 text-aura-purple" />
          {config.enabled ? "Пополнение рун · ЮKassa · СБП и карты" : "Безопасная оплата · ЮKassa"}
        </div>
      </section>
    </>
  );
}
