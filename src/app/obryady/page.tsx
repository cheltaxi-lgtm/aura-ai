import type { Metadata } from "next";
import Link from "next/link";
import { RITUAL_TYPES, type RitualType } from "@/lib/ritual-config";
import { RITUAL_PAGE_SLUGS } from "@/lib/ritual-recommendations";
import { BRAND_NAME } from "@/lib/brand";
import { buildSeoMetadata } from "@/lib/seo/metadata";
import { SeoPageShell } from "@/components/seo/SeoPageShell";

export const metadata: Metadata = buildSeoMetadata({
  title: `Обряды Zovus — энергетические практики с мастерами | ${BRAND_NAME}`,
  description:
    "Расклад показывает, что происходит. Обряд помогает сделать следующий шаг: притяжение, достаток, защита, удача, отпускание.",
  path: "/obryady",
});

const RITUAL_ORDER: RitualType[] = ["love", "money", "protection", "luck", "release"];

export default function ObryadyPage() {
  return (
    <SeoPageShell>
      <p className="text-sm text-aura-gold/80">Обряды</p>
      <h1 className="mt-2 font-display text-3xl font-bold">Обряды Zovus</h1>
      <p className="mt-4 text-white/70">
        Расклад показывает, что происходит. Обряд помогает сделать следующий шаг — с поддержкой
        мастера и сохранением истории в кабинете.
      </p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2">
        {RITUAL_ORDER.map((key) => {
          const ritual = RITUAL_TYPES[key];
          const slug = RITUAL_PAGE_SLUGS[key];
          return (
            <Link
              key={key}
              href={`/obryady/${slug}`}
              className="rounded-xl border border-white/10 bg-white/5 p-5 transition hover:border-aura-gold/30"
            >
              <p className="text-2xl">{ritual.emoji}</p>
              <p className="mt-2 font-display text-lg text-white">{ritual.label}</p>
              <p className="mt-2 text-sm text-white/60">{ritual.desc}</p>
              <p className="mt-3 text-xs text-white/40">от {ritual.cost} ᚢ</p>
            </Link>
          );
        })}
      </div>

      <p className="mt-10 text-sm text-white/50">
        Обряды проводят мастера{" "}
        <Link href="/master/ragnar" className="text-aura-gold hover:underline">
          Рагнар
        </Link>{" "}
        и{" "}
        <Link href="/master/agafya" className="text-aura-gold hover:underline">
          Агафья
        </Link>
        .
      </p>
    </SeoPageShell>
  );
}
