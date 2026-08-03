import type { Metadata } from "next";
import Link from "next/link";
import AboutPageShell, { AboutSection } from "@/components/seo/AboutPageShell";
import { BRAND_NAME, BRAND_URL } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import {
  BRAND_TELEGRAM_LABEL,
  getPublicTelegramBotUrl,
  getPublicTelegramBotUsername,
} from "@/lib/telegram-public";

const PATH = "/telegram";
const botUsername = getPublicTelegramBotUsername();
const botUrl = getPublicTelegramBotUrl();

export const metadata: Metadata = buildSeoMetadata({
  title: `Telegram-бот ${BRAND_NAME} — Таро и расклады в @${botUsername}`,
  description: `Официальный Telegram-бот ${BRAND_NAME} (@${botUsername}): бесплатный расклад из трёх карт, матрица судьбы и продолжение сеанса в мессенджере. Откройте бота на t.me/${botUsername}.`,
  path: PATH,
});

const BREADCRUMBS = [
  { name: "Zovus", path: "/" },
  { name: BRAND_TELEGRAM_LABEL, path: PATH },
];

function botStructuredData() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${BRAND_URL}${PATH}#webpage`,
        url: `${BRAND_URL}${PATH}`,
        name: `Telegram-бот ${BRAND_NAME}`,
        description: `Официальный Telegram-бот ${BRAND_NAME} @${botUsername}`,
        isPartOf: { "@id": `${BRAND_URL}/#website` },
        about: { "@id": `${BRAND_URL}${PATH}#bot` },
      },
      {
        "@type": "SoftwareApplication",
        "@id": `${BRAND_URL}${PATH}#bot`,
        name: `${BRAND_NAME} Telegram Bot`,
        alternateName: [`@${botUsername}`, botUsername],
        applicationCategory: "LifestyleApplication",
        operatingSystem: "Telegram",
        url: botUrl,
        downloadUrl: botUrl,
        installUrl: botUrl,
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "RUB",
          description: "Бесплатный старт: три карты до регистрации",
        },
        publisher: { "@id": `${BRAND_URL}/#organization` },
        sameAs: [botUrl, `${BRAND_URL}${PATH}`],
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: BREADCRUMBS.map((item, i) => ({
          "@type": "ListItem",
          position: i + 1,
          name: item.name,
          item: `${BRAND_URL}${item.path === "/" ? "" : item.path}`,
        })),
      },
    ],
  };
}

export default function TelegramBotPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(botStructuredData()) }}
      />
      <AboutPageShell
        title={BRAND_TELEGRAM_LABEL}
        h1={`Telegram-бот ${BRAND_NAME}`}
        intro={`Официальный бот @${botUsername}: расклады Таро, матрица судьбы и продолжение сеанса прямо в Telegram — без отдельного приложения.`}
        breadcrumbs={BREADCRUMBS}
      >
        <AboutSection title="Открыть бота">
          <p>
            Перейдите по ссылке{" "}
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-aura-gold hover:underline"
            >
              {botUrl}
            </a>{" "}
            или найдите в Telegram пользователя{" "}
            <strong className="text-white/90">@{botUsername}</strong>.
          </p>
          <p className="mt-4">
            <a
              href={botUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-xl border border-aura-gold/50 bg-aura-gold/15 px-5 py-3 text-sm font-semibold text-aura-gold transition hover:bg-aura-gold/25"
            >
              Открыть @{botUsername} в Telegram
            </a>
          </p>
        </AboutSection>

        <AboutSection title="Что умеет бот">
          <ul className="list-disc space-y-2 pl-5 text-white/75">
            <li>Бесплатный расклад из трёх карт до регистрации</li>
            <li>Матрица судьбы по дате рождения</li>
            <li>Продолжение диалога с наставником в чате Telegram</li>
            <li>Связка с аккаунтом на сайте {BRAND_NAME} для истории и рун</li>
          </ul>
        </AboutSection>

        <AboutSection title="Сайт и бот">
          <p>
            Полный каталог раскладов, статьи и веб-сеансы — на{" "}
            <Link href="/" className="text-aura-gold hover:underline">
              zovus.ru
            </Link>
            . Бот — быстрый вход в те же практики из мессенджера. Подробнее о сервисе:{" "}
            <Link href="/about" className="text-aura-gold hover:underline">
              О Zovus
            </Link>
            .
          </p>
        </AboutSection>
      </AboutPageShell>
    </>
  );
}
