import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = buildSeoMetadata({
  title: "Zovus Pro — кабинет практика",
  description:
    "Zovus Pro: рабочее пространство для практиков — клиенты, кейсы, черновики и выдача отчётов в эстетике салона Zovus.",
  path: "/zovus-pro",
});

export default function ZovusProMarketingPage() {
  return (
    <main className="editorial-landing relative pb-20">
      <section className="pro-marketing-hero mx-auto w-full max-w-5xl">
        <div className="pro-marketing-hero__glow" aria-hidden />
        <h1 className="pro-marketing-hero__brand relative">
          <span>{BRAND_NAME}</span>
          Pro
        </h1>
        <p className="pro-marketing-hero__lead relative">
          Кабинет для практикующих: клиенты, кейсы и аккуратные отчёты — без шума
          витрины гостевого салона.
        </p>
        <div className="relative mt-8 flex flex-wrap items-center gap-4">
          <Link
            href="/auth?returnTo=/pro"
            className="btn-luxe btn-luxe--md btn-luxe--gold inline-flex items-center gap-2"
          >
            Войти в Pro
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
          <Link
            href="/offer-pro"
            className="text-sm text-aura-ivory/50 transition-colors hover:text-aura-champagne"
          >
            Условия для практиков
          </Link>
        </div>
      </section>

      <section className="pro-marketing-section mx-auto max-w-5xl">
        <h2 className="pro-marketing-section__title">Для тех, кто ведёт клиентов</h2>
        <p className="pro-marketing-section__text">
          Соберите базу клиентов, ведите кейсы и выдавайте отчёты по защищённой ссылке.
          ИИ помогает с черновиками — финальное слово всегда за вами.
        </p>
      </section>

      <section className="pro-marketing-section mx-auto max-w-5xl border-t border-aura-gold/15">
        <h2 className="pro-marketing-section__title">Как начать</h2>
        <p className="pro-marketing-section__text">
          Войдите обычным аккаунтом Zovus, подайте заявку практика и дождитесь
          одобрения. Доступ к кабинету открывается после проверки.
        </p>
        <Link
          href="/auth?returnTo=/pro"
          className="btn-ghost mt-6 inline-flex items-center gap-2 px-5 py-2.5 text-sm"
        >
          Подать заявку
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </section>
    </main>
  );
}
